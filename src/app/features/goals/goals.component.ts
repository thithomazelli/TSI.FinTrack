import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { GoalService } from '../../core/services/goal.service';
import { CategoryService } from '../../core/services/category.service';
import { TransactionService } from '../../core/services/transaction.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { Goal } from '../../core/models/interfaces/goal.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';

interface GoalRow {
  goal: Goal;
  category: Category | undefined;
  spent: number;
  remaining: number;
  progress: number;
  exceeded: boolean;
}

@Component({
  selector: 'tsi-goals',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe, MonthPickerComponent],
  templateUrl: './goals.component.html',
  styleUrls: ['./goals.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalsComponent implements OnInit {
  private readonly goalService = inject(GoalService);
  private readonly categoryService = inject(CategoryService);
  private readonly transactionService = inject(TransactionService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly goals = signal<Goal[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly spentMap = signal<Record<string, number>>({});

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly deletingGoalId = signal<string | null>(null);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly formCategoryId = signal('');
  readonly formMonthlyLimit = signal<number | null>(null);

  readonly goalRows = computed<GoalRow[]>(() => {
    const spent = this.spentMap();
    return this.goals().map((g) => {
      const category = this.categories().find((c) => c.id === g.categoryId);
      const s = spent[g.categoryId] ?? 0;
      const remaining = g.monthlyLimit - s;
      const progress = g.monthlyLimit > 0 ? Math.min((s / g.monthlyLimit) * 100, 100) : 0;
      return { goal: g, category, spent: s, remaining, progress, exceeded: s > g.monthlyLimit };
    });
  });

  readonly categoriesWithoutGoal = computed(() => {
    const goalCatIds = new Set(this.goals().map((g) => g.categoryId));
    return this.categories().filter((c) => !goalCatIds.has(c.id));
  });

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => this.logger.error('Failed to load categories', err),
    });
    this.loadGoals();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.loadGoals();
  }

  private loadGoals(): void {
    this.loading.set(true);
    this.goalService.getByMonth(this.year(), this.month()).subscribe({
      next: (goals) => {
        this.goals.set(goals);
        this.loading.set(false);
        this.loadSpent();
      },
      error: (err) => {
        this.logger.error('Failed to load goals', err);
        this.loading.set(false);
      },
    });
  }

  private loadSpent(): void {
    this.transactionService
      .getByMonth({
        year: this.year(),
        month: this.month(),
        status: TransactionStatus.Realized,
      })
      .subscribe({
        next: (transactions) => {
          const map: Record<string, number> = {};
          for (const t of transactions) {
            if (!t.categoryId) continue;
            map[t.categoryId] = (map[t.categoryId] ?? 0) + t.amount;
          }
          this.spentMap.set(map);
        },
        error: (err) => this.logger.error('Failed to load transactions for goals', err),
      });
  }

  openAddForm(): void {
    this.editingId.set(null);
    this.formCategoryId.set('');
    this.formMonthlyLimit.set(null);
    this.showForm.set(true);
  }

  openEditForm(row: GoalRow): void {
    this.editingId.set(row.goal.id);
    this.formCategoryId.set(row.goal.categoryId);
    this.formMonthlyLimit.set(row.goal.monthlyLimit);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  saveGoal(): void {
    const categoryId = this.formCategoryId();
    const monthlyLimit = this.formMonthlyLimit();
    if (!categoryId || !monthlyLimit) return;

    this.saving.set(true);
    this.goalService
      .upsert({ categoryId, monthlyLimit, year: this.year(), month: this.month() })
      .subscribe({
        next: (goal) => {
          this.goals.update((list) => {
            const idx = list.findIndex((g) => g.id === goal.id || g.categoryId === goal.categoryId);
            if (idx >= 0) {
              const updated = [...list];
              updated[idx] = goal;
              return updated;
            }
            return [...list, goal];
          });
          this.saving.set(false);
          this.closeForm();
          this.toast.success('Meta salva com sucesso!');
        },
        error: (err) => {
          this.logger.error('Failed to save goal', err);
          this.saving.set(false);
          this.toast.error('Erro ao salvar meta.');
        },
      });
  }

  deleteGoal(id: string): void {
    this.deletingGoalId.set(id);
  }

  confirmDeleteGoal(): void {
    const id = this.deletingGoalId();
    if (!id) return;
    this.goalService.delete(id).subscribe({
      next: () => {
        this.goals.update((list) => list.filter((g) => g.id !== id));
        this.deletingGoalId.set(null);
        this.toast.success('Meta excluída.');
      },
      error: (err) => {
        this.logger.error('Failed to delete goal', err);
        this.deletingGoalId.set(null);
        this.toast.error('Erro ao excluir meta.');
      },
    });
  }
}
