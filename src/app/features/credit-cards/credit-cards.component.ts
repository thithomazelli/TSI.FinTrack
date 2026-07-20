import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe, DatePipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DateLangDirective } from '../../shared/directives/date-lang.directive';
import { TranslatePipe } from '@ngx-translate/core';
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
    imports: [DecimalPipe, DatePipe, SlicePipe, TranslatePipe, FormsModule, MonthPickerComponent, DateLangDirective],
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

  // ── Insert zone hover ────────────────────────────────────────────────────────
  readonly insertHoverKey = signal<string | null>(null);
  private readonly EDGE_PX = 48;

  onTxRowMouseMove(billId: string, txId: string | null, event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const key = `${billId}:${txId}`;
    this.insertHoverKey.set(event.clientX - rect.left <= this.EDGE_PX ? key : null);
  }

  onTxRowMouseLeave(): void { this.insertHoverKey.set(null); }

  isInsertHovered(billId: string, txId: string | null): boolean {
    return this.insertHoverKey() === `${billId}:${txId}`;
  }

  // ── Drag state ───────────────────────────────────────────────────────────────
  private dragBillId: string | null = null;
  private dragFromIdx = -1;
  readonly dragOverIdx = signal(-1);

  readonly year  = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  /** When true, hides bills with no transactions. */
  readonly onlyWithExpenses = signal(true);

  readonly visibleBills = computed(() => {
    const all = this.bills();
    if (!this.onlyWithExpenses()) return all;
    return all.filter(b => this.billTransactions(b).length > 0);
  });

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

  // installment fields
  formTxIsInstallment = false;
  formTxInstallments  = 2;
  formTxAmountType: 'total' | 'installment' = 'total';

  // ── Helpers ─────────────────────────────────────────────────────────────────
  billTransactions(bill: BillWithCard): Transaction[] {
    return this.transactions()
      .filter(t => t.creditCardId === bill.creditCardId)
      .sort((a, b) => {
        const da = a.purchaseDate ?? a.date;
        const db = b.purchaseDate ?? b.date;
        if (da !== db) return da.localeCompare(db);
        return (a.position ?? 0) - (b.position ?? 0);
      });
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
    Promise.all([this.cardService.getAll(false), this.categoryService.getAll()])
      .then(([cards, cats]) => { this.cards.set(cards); this.categories.set(cats); })
      .catch((err: unknown) => this.logger.error('Failed to load cards/cats', err));
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
    Promise.all([this.billService.getByMonth(y, m), this.txService.getByMonth({ year: y, month: m })])
      .then(([bills, txs]) => {
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
      })
      .catch((err: unknown) => { this.logger.error('Failed to load', err); this.loading.set(false); });
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
    this.billService.updateStatus(bill.id, status)
      .then(updated => {
        this.bills.update(list => list.map(b => b.id === updated.id ? { ...b, ...updated } : b));
        const txStatus = status === BillStatus.Paid  ? TransactionStatus.Realized
                       : status === BillStatus.Open  ? TransactionStatus.Projected
                       : null;
        if (txStatus && bill.creditCardId) {
          this.txService.bulkUpdateStatusByCardMonth(
            bill.creditCardId, this.year(), this.month(), txStatus
          ).then(() => {
              this.transactions.update(list =>
                list.map(t => t.creditCardId === bill.creditCardId ? { ...t, status: txStatus } : t)
              );
              this.balanceService.invalidate();
            })
            .catch((err: unknown) => this.logger.error('Bulk status update failed', err));
        }
        this.updatingId.set(null);
        this.toast.success('Status da fatura atualizado.');
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to update bill status', err);
        this.updatingId.set(null);
        this.toast.error('Erro ao atualizar status da fatura.');
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
    this.billService.upsert({ creditCardId: cardId, year: this.year(), month: this.month() })
      .then(() => {
        this.billModalOpen.set(false);
        this.saving.set(false);
        this.toast.success('Fatura criada.');
        this.loadAll();
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to save bill', err);
        this.saving.set(false);
        this.toast.error('Erro ao criar fatura.');
      });
  }

  openDeleteBill(bill: BillWithCard): void {
    this.deletingBill.set(bill);
  }

  confirmDeleteBill(): void {
    const bill = this.deletingBill();
    if (!bill) return;
    this.saving.set(true);
    this.billService.delete(bill.id)
      .then(() => {
        this.bills.update(list => list.filter(b => b.id !== bill.id));
        this.deletingBill.set(null);
        this.saving.set(false);
        this.toast.success('Fatura removida.');
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to delete bill', err);
        this.saving.set(false);
        this.toast.error('Erro ao remover fatura.');
      });
  }

  // ── Transaction add / edit / delete ─────────────────────────────────────────
  openAddTx(bill: BillWithCard): void {
    this.editingTxId.set(null);
    this.txModalCardId.set(bill.creditCardId);
    this.formTxDescription.set('');
    this.formTxAmount.set(0);
    this.formTxDate.set(bill.dueDate ?? this.today());
    this.formTxPurchaseDate.set(this.today());
    this.formTxCategoryId.set('');
    this.formTxStatus.set(TransactionStatus.Projected);
    this.formTxIsInstallment = false;
    this.formTxInstallments  = 2;
    this.formTxAmountType    = 'total';
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

  readonly saveAttempted = signal(false);
  private readonly _touched = new Set<string>();
  readonly touchedTick = signal(0);
  markTouched(f: string): void { this._touched.add(f); this.touchedTick.update(n => n + 1); }
  fi(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && !v; }
  fv(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && v; }
  closeTxModal(): void {
    this.txModalOpen.set(false);
    this.saveAttempted.set(false);
    this._touched.clear();
    this.formTxIsInstallment = false;
    this.formTxInstallments  = 2;
    this.formTxAmountType    = 'total';
  }

  saveTx(): void {
    if (!this.formTxDescription().trim() || this.formTxAmount() <= 0) { this.saveAttempted.set(true); return; }
    this.saving.set(true);

    const rawAmount = this.formTxAmount();
    const installments = this.formTxIsInstallment ? this.formTxInstallments : null;
    const amount = this.formTxIsInstallment && this.formTxAmountType === 'total' && installments
      ? rawAmount / installments
      : rawAmount;

    const payload: Partial<CreateTransactionPayload> = {
      description:   this.formTxDescription().trim(),
      amount,
      date:          this.formTxDate(),
      purchaseDate:  this.formTxPurchaseDate() || null,
      categoryId:    this.formTxCategoryId() || null,
      accountId:     null,
      creditCardId:  this.txModalCardId(),
      status:        this.formTxStatus(),
      totalInstallments: installments,
      recurringTemplateId: null,
      originalCurrency: null,
      originalAmount: null,
      exchangeRate: null,
      labels: [],
    };

    const id = this.editingTxId();
    const done = () => { this.txModalOpen.set(false); this.saving.set(false); this.balanceService.invalidate(); this.saveAttempted.set(false); this._touched.clear(); };
    const fail = (err: unknown) => { this.logger.error('Failed to save transaction', err); this.saving.set(false); this.toast.error('Erro ao salvar lançamento.'); };

    if (id) {
      this.txService.update(id, payload)
        .then((updated: Transaction) => {
          this.transactions.update(list => list.map(t => t.id === id ? updated : t));
          this.toast.success('Lançamento atualizado.');
          done();
        })
        .catch(fail);
    } else {
      this.txService.create(payload as CreateTransactionPayload)
        .then((created: Transaction[]) => {
          this.transactions.update(list => [...list, ...created]);
          this.toast.success('Lançamento adicionado.');
          done();
        })
        .catch(fail);
    }
  }

  toggleTxStatus(tx: Transaction, newStatus: TransactionStatus): void {
    this.txService.update(tx.id, { status: newStatus })
      .then((updated: Transaction) => {
        this.transactions.update(list => list.map(t => t.id === updated.id ? updated : t));
        this.balanceService.invalidate();
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to update tx status', err);
        this.toast.error('Erro ao atualizar status.');
      });
  }

  openDeleteTx(tx: Transaction): void {
    this.deletingTx.set(tx);
  }

  confirmDeleteTx(): void {
    const tx = this.deletingTx();
    if (!tx) return;
    this.saving.set(true);
    this.txService.delete(tx.id)
      .then(() => {
        this.transactions.update(list => list.filter(t => t.id !== tx.id));
        this.deletingTx.set(null);
        this.saving.set(false);
        this.balanceService.invalidate();
        this.toast.success('Lançamento removido.');
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to delete transaction', err);
        this.saving.set(false);
        this.toast.error('Erro ao remover lançamento.');
      });
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  onDragStart(bill: BillWithCard, idx: number, event: DragEvent): void {
    this.dragBillId = bill.id;
    this.dragFromIdx = idx;
    this.dragOverIdx.set(idx);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(idx));
    }
  }

  onDragOver(bill: BillWithCard, idx: number, event: DragEvent): void {
    if (bill.id !== this.dragBillId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIdx.set(idx);
  }

  onDrop(bill: BillWithCard, toIdx: number, event: DragEvent): void {
    event.preventDefault();
    const fromIdx = this.dragFromIdx;
    if (bill.id !== this.dragBillId || fromIdx === -1 || fromIdx === toIdx) {
      this.dragOverIdx.set(-1);
      return;
    }
    const txs = this.billTransactions(bill);
    const reordered = [...txs];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    reordered.forEach((tx, i) => {
      this.txService.updatePosition(tx.id, i)
        .catch((err: unknown) => this.logger.error('Failed to update position', err));
    });
    this.transactions.update(list => {
      const others = list.filter(t => t.creditCardId !== bill.creditCardId);
      return [...others, ...reordered.map((t, i) => ({ ...t, position: i }))];
    });
    this.dragOverIdx.set(-1);
    this.dragFromIdx = -1;
    this.dragBillId = null;
  }

  onDragEnd(): void {
    this.dragOverIdx.set(-1);
    this.dragFromIdx = -1;
    this.dragBillId = null;
  }

  isDragOver(bill: BillWithCard, idx: number): boolean {
    return this.dragBillId === bill.id && this.dragOverIdx() === idx && this.dragFromIdx !== idx;
  }
}
