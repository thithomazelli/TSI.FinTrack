import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService } from '../../core/services/transaction.service';
import { EntryService } from '../../core/services/entry.service';
import { GoalService } from '../../core/services/goal.service';
import { CategoryService } from '../../core/services/category.service';
import { AlertService, Alert } from '../../core/services/alert.service';
import { LoggingService } from '../../core/services/logging.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Goal } from '../../core/models/interfaces/goal.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { PeriodBarComponent } from '../../shared/components/period-bar/period-bar.component';

interface GoalSummary {
  goal: Goal;
  category: Category | undefined;
  spent: number;
  progress: number;
  exceeded: boolean;
}

@Component({
    selector: 'tsi-dashboard',
    imports: [DecimalPipe, TranslatePipe, PeriodBarComponent, RouterLink],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly transactionService = inject(TransactionService);
  private readonly entryService = inject(EntryService);
  private readonly goalService = inject(GoalService);
  private readonly categoryService = inject(CategoryService);
  private readonly alertService = inject(AlertService);
  private readonly logger = inject(LoggingService);

  readonly transactions = signal<Transaction[]>([]);
  readonly entries = signal<Entry[]>([]);
  readonly goals = signal<Goal[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly alerts = signal<Alert[]>([]);
  readonly dismissedAlertIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);
  readonly carouselIndex = signal(0);
  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  // Touch / drag swipe
  private dragStartX = 0;
  private isDragging = false;

  onDragStart(e: MouseEvent | TouchEvent): void {
    this.dragStartX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    this.isDragging = true;
    if (this.carouselTimer) clearInterval(this.carouselTimer);
  }

  onDragEnd(e: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const endX = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const delta = this.dragStartX - endX;
    if (Math.abs(delta) > 40) {
      delta > 0 ? this.carouselNext() : this.carouselPrev();
    } else {
      this.startCarouselTimer();
    }
  }

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly totalIncome = computed(() =>
    this.entries().reduce((sum, e) => sum + e.amount, 0)
  );

  readonly totalExpensesRealized = computed(() =>
    this.transactions()
      .filter((t) => t.status === TransactionStatus.Realized)
      .reduce((sum, t) => sum + t.amount, 0)
  );

  readonly totalExpensesProjected = computed(() =>
    this.transactions().reduce((sum, t) => sum + t.amount, 0)
  );

  readonly balanceRealized = computed(() => this.totalIncome() - this.totalExpensesRealized());
  readonly balanceProjected = computed(() => this.totalIncome() - this.totalExpensesProjected());

  readonly visibleAlerts = computed(() => {
    const dismissed = this.dismissedAlertIds();
    return this.alerts().filter((a) => !dismissed.has(a.id));
  });

  readonly goalSummaries = computed<GoalSummary[]>(() => {
    const spentMap: Record<string, number> = {};
    for (const t of this.transactions()) {
      if (t.status === TransactionStatus.Realized && t.categoryId) {
        spentMap[t.categoryId] = (spentMap[t.categoryId] ?? 0) + t.amount;
      }
    }
    return this.goals().map((g) => {
      const category = this.categories().find((c) => c.id === g.categoryId);
      const spent = spentMap[g.categoryId] ?? 0;
      const progress = g.monthlyLimit > 0 ? Math.min((spent / g.monthlyLimit) * 100, 100) : 0;
      return { goal: g, category, spent, progress, exceeded: spent > g.monthlyLimit };
    });
  });

  readonly topCategories = computed(() => {
    const map: Record<string, { name: string; color: string; amount: number }> = {};
    for (const t of this.transactions().filter((t) => t.status === TransactionStatus.Realized)) {
      const cat = this.categories().find((c) => c.id === t.categoryId);
      if (!t.categoryId) continue;
      if (!map[t.categoryId]) {
        map[t.categoryId] = { name: cat?.name ?? t.categoryId, color: cat?.color ?? '#ccc', amount: 0 };
      }
      map[t.categoryId].amount += t.amount;
    }
    return Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 5);
  });

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => this.logger.error('Failed to load categories', err),
    });
    this.loadData();
  }

  ngOnDestroy(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.dismissedAlertIds.set(new Set());
    this.loadData();
  }

  dismissAlert(id: string): void {
    this.dismissedAlertIds.update((set) => new Set([...set, id]));
  }

  carouselPrev(): void {
    const len = this.visibleAlerts().length;
    if (!len) return;
    this.carouselIndex.update((i) => (i - 1 + len) % len);
    this.resetCarouselTimer();
  }

  carouselNext(): void {
    const len = this.visibleAlerts().length;
    if (!len) return;
    this.carouselIndex.update((i) => (i + 1) % len);
    this.resetCarouselTimer();
  }

  private startCarouselTimer(): void {
    this.carouselTimer = setInterval(() => {
      const len = this.visibleAlerts().length;
      if (len > 1) this.carouselIndex.update((i) => (i + 1) % len);
    }, 5000);
  }

  private resetCarouselTimer(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.startCarouselTimer();
  }

  private loadData(): void {
    this.loading.set(true);
    const y = this.year();
    const m = this.month();

    this.transactionService.getByMonth({ year: y, month: m }).subscribe({
      next: (t) => this.transactions.set(t),
      error: (err) => this.logger.error('Failed to load transactions', err),
    });

    this.entryService.getByMonth({ year: y, month: m }).subscribe({
      next: (e) => this.entries.set(e),
      error: (err) => this.logger.error('Failed to load entries', err),
    });

    this.goalService.getByMonth(y, m).subscribe({
      next: (g) => {
        this.goals.set(g);
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load goals', err);
        this.loading.set(false);
      },
    });

    this.alertService.getAlerts(y, m).subscribe({
      next: (alerts) => {
        this.alerts.set(alerts);
        this.carouselIndex.set(0);
        if (this.carouselTimer) clearInterval(this.carouselTimer);
        if (alerts.length > 1) this.startCarouselTimer();
      },
      error: (err) => this.logger.error('Failed to load alerts', err),
    });
  }
}
