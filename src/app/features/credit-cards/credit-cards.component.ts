import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { BalanceService } from '../../core/services/balance.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { CreditCardBill } from '../../core/models/interfaces/credit-card-bill.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { BillStatus } from '../../core/models/enums/bill-status.enum';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';

interface BillWithCard extends CreditCardBill {
  credit_cards?: { name: string; last_four_digits: string };
}

@Component({
  selector: 'tsi-credit-cards',
  standalone: true,
  imports: [DecimalPipe, DatePipe, TranslatePipe, MonthPickerComponent],
  templateUrl: './credit-cards.component.html',
  styleUrls: ['./credit-cards.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditCardsComponent implements OnInit {
  private readonly billService    = inject(CreditCardBillService);
  private readonly cardService    = inject(CreditCardService);
  private readonly txService      = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly balanceService = inject(BalanceService);
  private readonly logger         = inject(LoggingService);
  private readonly toast          = inject(ToastService);

  readonly BillStatus = BillStatus;

  readonly bills        = signal<BillWithCard[]>([]);
  readonly cards        = signal<CreditCard[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly categories   = signal<Category[]>([]);
  readonly loading      = signal(false);
  readonly updatingId   = signal<string | null>(null);
  readonly expandedBillId = signal<string | null>(null);

  readonly year  = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly cardsWithoutBill = computed(() => {
    const billCardIds = new Set(this.bills().map(b => b.creditCardId));
    return this.cards().filter(c => !billCardIds.has(c.id));
  });

  billTransactions(cardId: string): Transaction[] {
    return this.transactions().filter(t => t.creditCardId === cardId);
  }

  billTotal(cardId: string): number {
    return this.billTransactions(cardId).reduce((s, t) => s + t.amount, 0);
  }

  categoryName(id: string | null | undefined): string {
    if (!id) return '—';
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  categoryColor(id: string | null | undefined): string {
    if (!id) return '#9ca3af';
    return this.categories().find(c => c.id === id)?.color ?? '#9ca3af';
  }

  ngOnInit(): void {
    forkJoin({
      cards: this.cardService.getAll(false),
      cats:  this.categoryService.getAll(),
    }).subscribe({
      next: ({ cards, cats }) => { this.cards.set(cards); this.categories.set(cats); },
      error: err => this.logger.error('Failed to load cards/cats', err),
    });
    this.loadAll();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.expandedBillId.set(null);
    this.loadAll();
  }

  private loadAll(): void {
    this.loading.set(true);
    const y = this.year(), m = this.month();
    forkJoin({
      bills: this.billService.getByMonth(y, m),
      txs:   this.txService.getByMonth({ year: y, month: m }),
    }).subscribe({
      next: ({ bills, txs }) => {
        this.bills.set(bills as BillWithCard[]);
        this.transactions.set(txs.filter(t => !!t.creditCardId));
        this.loading.set(false);
      },
      error: err => { this.logger.error('Failed to load', err); this.loading.set(false); },
    });
  }

  toggleExpand(billId: string): void {
    this.expandedBillId.update(id => id === billId ? null : billId);
  }

  updateStatus(bill: BillWithCard, status: BillStatus): void {
    this.updatingId.set(bill.id);

    this.billService.updateStatus(bill.id, status).subscribe({
      next: updated => {
        this.bills.update(list => list.map(b => b.id === updated.id ? { ...b, ...updated } : b));

        // Bulk-update transaction statuses
        const txStatus = status === BillStatus.Paid   ? TransactionStatus.Realized
                       : status === BillStatus.Open   ? TransactionStatus.Projected
                       : null;

        if (txStatus && bill.creditCardId) {
          this.txService.bulkUpdateStatusByCardMonth(
            bill.creditCardId, this.year(), this.month(), txStatus
          ).subscribe({
            next: () => {
              // refresh local transactions
              this.transactions.update(list =>
                list.map(t =>
                  t.creditCardId === bill.creditCardId ? { ...t, status: txStatus } : t
                )
              );
              this.balanceService.invalidate();
            },
            error: err => this.logger.error('Bulk status update failed', err),
          });
        }

        this.updatingId.set(null);
        this.toast.success('Status da fatura atualizado.');
      },
      error: err => {
        this.logger.error('Failed to update bill status', err);
        this.updatingId.set(null);
        this.toast.error('Erro ao atualizar status da fatura.');
      },
    });
  }

  createBillForCard(card: CreditCard): void {
    this.billService.upsert({ creditCardId: card.id, year: this.year(), month: this.month() }).subscribe({
      next: bill => {
        const exists = this.bills().some(b => b.id === bill.id);
        if (!exists) {
          const billWithCard: BillWithCard = {
            ...(bill as BillWithCard),
            credit_cards: { name: card.name, last_four_digits: card.lastFourDigits },
          };
          this.bills.update(list => [...list, billWithCard]);
        }
      },
      error: err => this.logger.error('Failed to create bill', err),
    });
  }

  nextStatus(current: BillStatus): BillStatus {
    if (current === BillStatus.Open)   return BillStatus.Closed;
    if (current === BillStatus.Closed) return BillStatus.Paid;
    return BillStatus.Open;
  }

  nextStatusLabel(current: BillStatus): string {
    if (current === BillStatus.Open)   return 'creditCards.closeBill';
    if (current === BillStatus.Closed) return 'creditCards.markPaid';
    return 'creditCards.reopen';
  }

  statusClass(status: BillStatus): string {
    return ({ [BillStatus.Open]: 'status-open', [BillStatus.Closed]: 'status-closed', [BillStatus.Paid]: 'status-paid' })[status] ?? '';
  }
}
