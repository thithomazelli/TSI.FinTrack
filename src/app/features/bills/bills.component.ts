import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../core/services/transaction.service';
import { AccountService } from '../../core/services/account.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';

@Component({
  selector: 'tsi-bills',
  standalone: true,
  imports: [DecimalPipe, DatePipe, FormsModule, MonthPickerComponent],
  templateUrl: './bills.component.html',
  styleUrls: ['./bills.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillsComponent implements OnInit {
  private readonly txService = inject(TransactionService);
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);

  readonly transactions = signal<Transaction[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly loading = signal(false);
  readonly selectedCardId = signal<string | 'all'>('all');
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly filtered = computed(() => {
    const id = this.selectedCardId();
    const txs = this.transactions();
    if (id === 'all') return txs;
    if (id === 'debit') return txs.filter(t => !t.creditCardId);
    return txs.filter(t => t.creditCardId === id);
  });

  readonly total = computed(() => this.filtered().reduce((s, t) => s + t.amount, 0));

  ngOnInit(): void {
    this.cardService.getAll().subscribe({ next: c => this.cards.set(c) });
    this.load();
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
}
