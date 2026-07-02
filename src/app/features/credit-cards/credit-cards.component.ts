import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe, DatePipe, SlicePipe } from '@angular/common';
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

interface BillWithCard extends CreditCardBill {
  credit_cards?: { name: string; last_four_digits: string };
}

interface MonthGroup {
  year: number;
  month: number;
  label: string;
  bills: BillWithCard[];
}

@Component({
  selector: 'tsi-credit-cards',
  standalone: true,
  imports: [DecimalPipe, DatePipe, SlicePipe, TranslatePipe],
  templateUrl: './credit-cards.component.html',
  styleUrls: ['./credit-cards.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditCardsComponent implements OnInit {
  private readonly billService     = inject(CreditCardBillService);
  private readonly cardService     = inject(CreditCardService);
  private readonly txService       = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly balanceService  = inject(BalanceService);
  private readonly logger          = inject(LoggingService);
  private readonly toast           = inject(ToastService);

  readonly BillStatus = BillStatus;

  readonly bills        = signal<BillWithCard[]>([]);
  readonly cards        = signal<CreditCard[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly categories   = signal<Category[]>([]);
  readonly loading      = signal(false);
  readonly updatingId   = signal<string | null>(null);
  readonly expandedBillIds = signal<Set<string>>(new Set());

  readonly monthGroups = computed<MonthGroup[]>(() => {
    const bills = this.bills();
    const map = new Map<string, BillWithCard[]>();
    for (const b of bills) {
      const key = `${b.year}-${b.month}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return [...map.entries()].map(([, bills]) => {
      const { year, month } = bills[0];
      const date = new Date(year, month - 1, 1);
      const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      return { year, month, label: label.charAt(0).toUpperCase() + label.slice(1), bills };
    });
  });

  billTransactions(bill: BillWithCard): Transaction[] {
    const startDate = `${bill.year}-${String(bill.month).padStart(2, '0')}-01`;
    const endDate   = new Date(bill.year, bill.month, 0).toISOString().split('T')[0];
    return this.transactions().filter(t =>
      t.creditCardId === bill.creditCardId &&
      t.date >= startDate && t.date <= endDate
    );
  }

  billTotal(bill: BillWithCard): number {
    return this.billTransactions(bill).reduce((s, t) => s + t.amount, 0);
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
    this.loading.set(true);
    forkJoin({
      cards: this.cardService.getAll(false),
      cats:  this.categoryService.getAll(),
      bills: this.billService.getAll(),
      txs:   this.txService.getAllCreditCard(),
    }).subscribe({
      next: ({ cards, cats, bills, txs }) => {
        this.cards.set(cards);
        this.categories.set(cats);
        this.bills.set(bills as BillWithCard[]);
        this.transactions.set(txs);
        // Auto-expand bills that have transactions
        const withTx = new Set(
          (bills as BillWithCard[])
            .filter(b => txs.some(t => {
              const start = `${b.year}-${String(b.month).padStart(2, '0')}-01`;
              const end   = new Date(b.year, b.month, 0).toISOString().split('T')[0];
              return t.creditCardId === b.creditCardId && t.date >= start && t.date <= end;
            }))
            .map(b => b.id)
        );
        this.expandedBillIds.set(withTx);
        this.loading.set(false);
      },
      error: err => { this.logger.error('Failed to load', err); this.loading.set(false); },
    });
  }

  isExpanded(billId: string): boolean {
    return this.expandedBillIds().has(billId);
  }

  toggleExpand(billId: string): void {
    this.expandedBillIds.update(set => {
      const next = new Set(set);
      next.has(billId) ? next.delete(billId) : next.add(billId);
      return next;
    });
  }

  updateStatus(bill: BillWithCard, status: BillStatus): void {
    this.updatingId.set(bill.id);

    this.billService.updateStatus(bill.id, status).subscribe({
      next: updated => {
        this.bills.update(list => list.map(b => b.id === updated.id ? { ...b, ...updated } : b));

        const txStatus = status === BillStatus.Paid  ? TransactionStatus.Realized
                       : status === BillStatus.Open  ? TransactionStatus.Projected
                       : null;

        if (txStatus && bill.creditCardId) {
          this.txService.bulkUpdateStatusByCardMonth(
            bill.creditCardId, bill.year, bill.month, txStatus
          ).subscribe({
            next: () => {
              const start = `${bill.year}-${String(bill.month).padStart(2, '0')}-01`;
              const end   = new Date(bill.year, bill.month, 0).toISOString().split('T')[0];
              this.transactions.update(list =>
                list.map(t =>
                  t.creditCardId === bill.creditCardId && t.date >= start && t.date <= end
                    ? { ...t, status: txStatus } : t
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
