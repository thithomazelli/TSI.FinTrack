import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { TransactionService, CreateTransactionPayload } from '../../core/services/transaction.service';
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
    imports: [DecimalPipe, DatePipe, SlicePipe, TranslatePipe, FormsModule, MonthPickerComponent],
    templateUrl: './credit-cards.component.html',
    styleUrls: ['./credit-cards.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
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
  readonly TransactionStatus = TransactionStatus;

  readonly bills        = signal<BillWithCard[]>([]);
  readonly cards        = signal<CreditCard[]>([]);
  readonly transactions = signal<Transaction[]>([]);
  readonly categories   = signal<Category[]>([]);
  readonly loading      = signal(false);
  readonly saving       = signal(false);
  readonly updatingId   = signal<string | null>(null);
  readonly expandedBillIds = signal<Set<string>>(new Set());

  readonly year  = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  // ── Bill modal ──────────────────────────────────────────────────────────────
  readonly billModalOpen   = signal(false);
  readonly editingBillId   = signal<string | null>(null);
  readonly formBillCardId  = signal('');
  readonly deletingBill    = signal<BillWithCard | null>(null);

  // ── Transaction modal ───────────────────────────────────────────────────────
  readonly txModalOpen        = signal(false);
  readonly editingTxId        = signal<string | null>(null);
  readonly txModalCardId      = signal<string | null>(null);
  readonly formTxDescription  = signal('');
  readonly formTxAmount       = signal(0);
  readonly formTxDate         = signal('');
  readonly formTxPurchaseDate = signal('');
  readonly formTxCategoryId   = signal('');
  readonly formTxStatus       = signal<TransactionStatus>(TransactionStatus.Projected);
  readonly deletingTx         = signal<Transaction | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  billTransactions(bill: BillWithCard): Transaction[] {
    return this.transactions()
      .filter(t => t.creditCardId === bill.creditCardId)
      .sort((a, b) => (b.purchaseDate ?? b.date).localeCompare(a.purchaseDate ?? a.date));
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

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
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
    this.expandedBillIds.set(new Set());
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
        const cardTxs = txs.filter(t => !!t.creditCardId);
        this.bills.set(bills as BillWithCard[]);
        this.transactions.set(cardTxs);
        const withTx = new Set(
          (bills as BillWithCard[])
            .filter(b => cardTxs.some(t => t.creditCardId === b.creditCardId))
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

  // ── Bill status ──────────────────────────────────────────────────────────────
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
            bill.creditCardId, this.year(), this.month(), txStatus
          ).subscribe({
            next: () => {
              this.transactions.update(list =>
                list.map(t => t.creditCardId === bill.creditCardId ? { ...t, status: txStatus } : t)
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

  // ── Bill add / delete ────────────────────────────────────────────────────────
  openAddBill(): void {
    this.editingBillId.set(null);
    this.formBillCardId.set('');
    this.billModalOpen.set(true);
  }

  saveBill(): void {
    const cardId = this.formBillCardId();
    if (!cardId) return;
    this.saving.set(true);
    this.billService.upsert({ creditCardId: cardId, year: this.year(), month: this.month() }).subscribe({
      next: () => {
        this.billModalOpen.set(false);
        this.saving.set(false);
        this.toast.success('Fatura criada.');
        this.loadAll();
      },
      error: err => {
        this.logger.error('Failed to save bill', err);
        this.saving.set(false);
        this.toast.error('Erro ao criar fatura.');
      },
    });
  }

  openDeleteBill(bill: BillWithCard): void {
    this.deletingBill.set(bill);
  }

  confirmDeleteBill(): void {
    const bill = this.deletingBill();
    if (!bill) return;
    this.saving.set(true);
    this.billService.delete(bill.id).subscribe({
      next: () => {
        this.bills.update(list => list.filter(b => b.id !== bill.id));
        this.deletingBill.set(null);
        this.saving.set(false);
        this.toast.success('Fatura removida.');
      },
      error: err => {
        this.logger.error('Failed to delete bill', err);
        this.saving.set(false);
        this.toast.error('Erro ao remover fatura.');
      },
    });
  }

  // ── Transaction add / edit / delete ─────────────────────────────────────────
  openAddTx(bill: BillWithCard): void {
    this.editingTxId.set(null);
    this.txModalCardId.set(bill.creditCardId);
    this.formTxDescription.set('');
    this.formTxAmount.set(0);
    this.formTxDate.set(this.today());
    this.formTxPurchaseDate.set(this.today());
    this.formTxCategoryId.set('');
    this.formTxStatus.set(TransactionStatus.Projected);
    this.txModalOpen.set(true);
  }

  openEditTx(tx: Transaction): void {
    this.editingTxId.set(tx.id);
    this.txModalCardId.set(tx.creditCardId);
    this.formTxDescription.set(tx.description);
    this.formTxAmount.set(Math.abs(tx.amount));
    this.formTxDate.set(tx.date);
    this.formTxPurchaseDate.set(tx.purchaseDate ?? tx.date);
    this.formTxCategoryId.set(tx.categoryId ?? '');
    this.formTxStatus.set(tx.status);
    this.txModalOpen.set(true);
  }

  saveTx(): void {
    if (!this.formTxDescription().trim() || this.formTxAmount() <= 0) return;
    this.saving.set(true);

    const payload: Partial<CreateTransactionPayload> = {
      description:   this.formTxDescription().trim(),
      amount:        this.formTxAmount(),
      date:          this.formTxDate(),
      purchaseDate:  this.formTxPurchaseDate() || null,
      categoryId:    this.formTxCategoryId() || null,
      accountId:     null,
      creditCardId:  this.txModalCardId(),
      status:        this.formTxStatus(),
      totalInstallments: null,
      recurringTemplateId: null,
      originalCurrency: null,
      originalAmount: null,
      exchangeRate: null,
      labels: [],
    };

    const id = this.editingTxId();
    const done = () => { this.txModalOpen.set(false); this.saving.set(false); this.balanceService.invalidate(); };
    const fail = (err: unknown) => { this.logger.error('Failed to save transaction', err); this.saving.set(false); this.toast.error('Erro ao salvar lançamento.'); };

    if (id) {
      this.txService.update(id, payload).subscribe({
        next: (updated: Transaction) => {
          this.transactions.update(list => list.map(t => t.id === id ? updated : t));
          this.toast.success('Lançamento atualizado.');
          done();
        },
        error: fail,
      });
    } else {
      this.txService.create(payload as CreateTransactionPayload).subscribe({
        next: (created: Transaction[]) => {
          this.transactions.update(list => [...list, ...created]);
          this.toast.success('Lançamento adicionado.');
          done();
        },
        error: fail,
      });
    }
  }

  openDeleteTx(tx: Transaction): void {
    this.deletingTx.set(tx);
  }

  confirmDeleteTx(): void {
    const tx = this.deletingTx();
    if (!tx) return;
    this.saving.set(true);
    this.txService.delete(tx.id).subscribe({
      next: () => {
        this.transactions.update(list => list.filter(t => t.id !== tx.id));
        this.deletingTx.set(null);
        this.saving.set(false);
        this.balanceService.invalidate();
        this.toast.success('Lançamento removido.');
      },
      error: err => {
        this.logger.error('Failed to delete transaction', err);
        this.saving.set(false);
        this.toast.error('Erro ao remover lançamento.');
      },
    });
  }
}
