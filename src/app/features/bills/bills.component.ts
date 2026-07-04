import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed, ChangeDetectorRef } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, Chart, registerables } from 'chart.js';
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService } from '../../core/services/transaction.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { CategoryService } from '../../core/services/category.service';
import { LoggingService } from '../../core/services/logging.service';
import { ThemeService } from '../../core/services/theme.service';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { Category } from '../../core/models/interfaces/category.interface';

Chart.register(...registerables);

@Component({
    selector: 'tsi-bills',
    imports: [DecimalPipe, DatePipe, FormsModule, MonthPickerComponent, TranslatePipe, BaseChartDirective],
    templateUrl: './bills.component.html',
    styleUrls: ['./bills.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BillsComponent implements OnInit {
  private readonly txService = inject(TransactionService);
  private readonly cardService = inject(CreditCardService);
  private readonly categoryService = inject(CategoryService);
  private readonly logger = inject(LoggingService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly themeService = inject(ThemeService);

  readonly transactions = signal<Transaction[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly selectedCardId = signal<string | 'all'>('all');
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly dndMode = signal(false);

  // Drag state
  dragFromIndex = -1;
  dragOverIndex = -1;

  readonly filtered = computed(() => {
    const id = this.selectedCardId();
    const txs = this.transactions();
    let result: Transaction[];
    if (id === 'all') result = txs;
    else if (id === 'debit') result = txs.filter(t => !t.creditCardId);
    else result = txs.filter(t => t.creditCardId === id);
    if (this.dndMode()) {
      return [...result].sort((a, b) => (a.position ?? 999999) - (b.position ?? 999999));
    }
    return result;
  });

  readonly total = computed(() => this.filtered().reduce((s, t) => s + t.amount, 0));

  readonly categorySpend = computed(() => {
    const map = new Map<string, number>();
    for (const t of this.filtered()) {
      const key = t.categoryId || '__sem__';
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    return [...map.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryId === '__sem__' ? 'Sem categoria' : (this.categoryName(categoryId) || 'Sem categoria'),
        color: categoryId === '__sem__' ? '#9ca3af' : this.categoryColor(categoryId),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
  });

  readonly categoryPieData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.categorySpend().map(c => c.name),
    datasets: [{
      data: this.categorySpend().map(c => c.amount),
      backgroundColor: this.categorySpend().map(c => c.color),
      borderWidth: 2,
      borderColor: this.themeService.isDark() ? '#1a1d27' : '#ffffff',
    }],
  }));

  readonly doughnutOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const v = ctx.parsed as number;
            const total = this.categorySpend().reduce((s, c) => s + c.amount, 0) || 1;
            const pct = ((v / total) * 100).toFixed(1);
            return ` ${ctx.label}: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${pct}%)`;
          },
        },
      },
    },
  } as ChartConfiguration<'doughnut'>['options']));

  ngOnInit(): void {
    this.cardService.getAll().subscribe({ next: c => this.cards.set(c) });
    this.categoryService.getAll().subscribe({ next: c => this.categories.set(c) });
    this.load();
  }

  categoryName(id: string | null): string {
    if (!id) return '—';
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  categoryColor(id: string | null): string {
    if (!id) return '#9ca3af';
    return this.categories().find(c => c.id === id)?.color ?? '#9ca3af';
  }

  load(): void {
    this.loading.set(true);
    this.txService.getByMonth({ year: this.year(), month: this.month() }).subscribe({
      next: data => { this.transactions.set(data); this.loading.set(false); },
      error: err => { this.logger.error('Failed to load bills', err); this.loading.set(false); },
    });
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.load();
  }

  cardTotal(cardId: string | null): number {
    const txs = this.transactions();
    if (!cardId) return txs.filter(t => !t.creditCardId).reduce((s, t) => s + t.amount, 0);
    return txs.filter(t => t.creditCardId === cardId).reduce((s, t) => s + t.amount, 0);
  }

  cardName(id: string | null): string {
    if (!id) return 'Débito / PIX';
    return this.cards().find(c => c.id === id)?.name ?? id;
  }

  uniqueCards(): Array<{ id: string | null; name: string; total: number }> {
    const txs = this.transactions();
    const cardIds = [...new Set(txs.map(t => t.creditCardId))];
    return cardIds.map(id => ({ id, name: this.cardName(id), total: this.cardTotal(id) }))
      .sort((a, b) => b.total - a.total);
  }

  toggleDndMode(): void { this.dndMode.update(v => !v); }

  onBillDragStart(index: number, event: DragEvent): void {
    this.dragFromIndex = index;
    this.dragOverIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
    this.cdr.markForCheck();
  }

  onBillDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = index;
    this.cdr.markForCheck();
  }

  onBillDrop(toIndex: number, event: DragEvent): void {
    event.preventDefault();
    const fromIndex = this.dragFromIndex;
    if (fromIndex === -1 || fromIndex === toIndex) {
      this.dragOverIndex = -1;
      this.cdr.markForCheck();
      return;
    }

    const items = [...this.filtered()];
    const dragged = items[fromIndex];
    items.splice(fromIndex, 1);
    items.splice(toIndex, 0, dragged);

    const aboveItem = toIndex > 0 ? items[toIndex - 1] : null;
    const belowItem = toIndex < items.length - 1 ? items[toIndex + 1] : null;

    let newPosition: number;
    if (!aboveItem && !belowItem) {
      newPosition = 1000;
    } else if (!aboveItem) {
      newPosition = (belowItem!.position ?? 1000) - 1000;
    } else if (!belowItem) {
      newPosition = (aboveItem!.position ?? 1000) + 1000;
    } else {
      newPosition = ((aboveItem.position ?? 0) + (belowItem.position ?? 0)) / 2;
    }

    this.transactions.update(list =>
      list.map(t => t.id === dragged.id ? { ...t, position: newPosition } : t)
    );

    this.txService.updatePosition(dragged.id, newPosition).subscribe({
      error: err => this.logger.error('Failed to update bill position', err),
    });

    this.dragOverIndex = -1;
    this.dragFromIndex = -1;
    this.cdr.markForCheck();
  }

  onBillDragEnd(): void {
    this.dragOverIndex = -1;
    this.dragFromIndex = -1;
    this.cdr.markForCheck();
  }
}
