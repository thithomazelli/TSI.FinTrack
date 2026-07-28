import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnInit,
  inject,
  signal,
  computed,
  effect,
  untracked,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, Chart, registerables } from 'chart.js';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EntryService, CreateEntryPayload } from '../../core/services/entry.service';
import { TransactionService, CreateTransactionPayload } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { DomainListService } from '../../core/services/domain-list.service';
import { ActivatedRoute } from '@angular/router';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { BalanceService } from '../../core/services/balance.service';
import { SavingsService } from '../../core/services/savings.service';
import { AuthService } from '../../core/auth/auth.service';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { CreditCardBill } from '../../core/models/interfaces/credit-card-bill.interface';
import { BillStatus } from '../../core/models/enums/bill-status.enum';
import { LabelsInputComponent } from '../../shared/components/labels-input/labels-input.component';
import { CurrencyMaskDirective } from '../../shared/directives/currency-mask.directive';
import { ModalKeyDirective } from '../../shared/directives/modal-key.directive';
import { DateLangDirective } from '../../shared/directives/date-lang.directive';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { BalanceCardComponent } from '../../shared/components/balance-card/balance-card.component';
import { SavingsBalanceCardComponent } from '../../shared/components/savings-balance-card/savings-balance-card.component';
import { GroupedTableComponent, TableGroup, GroupInsertEvent, GroupReorderEvent, GroupSearchFn } from '../../shared/components/grouped-table/grouped-table.component';
import { ThemeService } from '../../core/services/theme.service';

Chart.register(...registerables);

export interface MovimentoItem {
  kind: 'entry' | 'transaction';
  id: string;
  date: string;
  /** Purchase date for credit card transactions; null for others. */
  purchaseDate: string | null;
  description: string;
  amount: number;
  status: string;
  categoryId?: string;
  accountId?: string | null;
  creditCardId?: string | null;
  typeId?: string;
  position?: number;
  raw: Entry | Transaction;
}

type ModalMode = 'entry' | 'transaction' | null;

@Component({
    selector: 'tsi-movimentos',
    imports: [DecimalPipe, DatePipe, FormsModule, LabelsInputComponent, MonthPickerComponent, BalanceCardComponent, SavingsBalanceCardComponent, BaseChartDirective, TranslatePipe, GroupedTableComponent, CurrencyMaskDirective, DateLangDirective, ModalKeyDirective],
    templateUrl: './movimentos.component.html',
    styleUrls: ['./movimentos.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MovimentosComponent implements OnInit {
  private readonly entryService = inject(EntryService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly cardService = inject(CreditCardService);
  private readonly domainListService = inject(DomainListService);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);
  private readonly supabase = inject(SupabaseService);
  private readonly balanceService = inject(BalanceService);
  private readonly savingsService = inject(SavingsService);
  private readonly billService = inject(CreditCardBillService);
  private readonly auth = inject(AuthService);
  readonly themeService = inject(ThemeService);
  private readonly t = inject(TranslateService);

  private tr(key: string): string {
    return this.t.instant(key);
  }

  readonly TransactionStatus = TransactionStatus;
  readonly BillStatus = BillStatus;

  // Data
  readonly allEntries = signal<Entry[]>([]);
  readonly allTransactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly bills = signal<CreditCardBill[]>([]);
  readonly entryTypes    = signal<DomainList[]>([]);
  readonly accountTypes  = signal<DomainList[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly billUpdatingId = signal<string | null>(null);

  // Filters
  readonly filterTipos      = signal<Set<string>>(new Set());
  readonly filterStatuses   = signal<Set<string>>(new Set());
  readonly filterCategoryId = signal<string>('');
  readonly filterCardIds    = signal<Set<string>>(new Set());
  readonly filterPanelOpen  = signal(false);

  readonly activeFilterCount = computed(() =>
    this.filterTipos().size + this.filterStatuses().size +
    (this.filterCategoryId() ? 1 : 0) + this.filterCardIds().size
  );

  // Período: 'month' = mês único, 'range' = intervalo personalizado
  readonly periodMode = signal<'month' | 'range'>('month');
  readonly year = signal<number>(new Date().getFullYear());
  readonly month = signal<number>(new Date().getMonth() + 1);

  private defaultFrom(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  private defaultTo(): string {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return last.toISOString().split('T')[0];
  }

  readonly dateFrom = signal<string>(this.defaultFrom());
  readonly dateTo = signal<string>(this.defaultTo());

  // Modal
  readonly modalMode = signal<ModalMode>(null);
  readonly editingId = signal<string | null>(null);

  // Entry form fields
  formEntryDescription = '';
  formEntryAmount = 0;
  formEntryDate = new Date().toISOString().split('T')[0];
  formEntryStatus = 'PROJECTED';
  formEntryTypeId = '';
  formEntryAccountId = '';
  formEntryLabels: string[] = [];
  formEntryIsInstallment = false;
  formEntryInstallments = 2;
  formEntryAmountType: 'total' | 'installment' = 'total';

  // Transaction form fields
  formTxDescription = '';
  formTxAmount = 0;
  formTxDate = new Date().toISOString().split('T')[0];
  formTxStatus: TransactionStatus = TransactionStatus.Projected;
  formTxCategoryId = '';
  formTxAccountId = '';
  formTxCreditCardId = '';
  formTxPaymentAccountId = '';
  formTxPurchaseDate = '';
  formTxIsInstallment = false;
  formTxInstallments = 2;
  formTxAmountType: 'total' | 'installment' = 'total';
  formTxIsInternational = false;
  formTxOriginalCurrency = 'USD';
  formTxOriginalAmount = 0;
  formTxExchangeRate = 0;
  formTxLabels: string[] = [];

  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly dndMode = signal(false);

  // Computed unified list
  readonly allItems = computed<MovimentoItem[]>(() => {
    const entries: MovimentoItem[] = this.allEntries().map(e => ({
      kind: 'entry',
      id: e.id,
      date: e.date,
      purchaseDate: null,
      description: e.description,
      amount: e.amount,
      status: e.status ?? 'REALIZED',
      accountId: e.accountId,
      typeId: e.typeId,
      position: e.position,
      raw: e,
    }));

    const txs: MovimentoItem[] = this.allTransactions().map(t => ({
      kind: 'transaction',
      id: t.id,
      date: t.date,
      purchaseDate: t.purchaseDate,
      description: t.description,
      amount: t.amount,
      status: t.status,
      categoryId: t.categoryId,
      accountId: t.accountId,
      creditCardId: t.creditCardId,
      position: t.position,
      raw: t,
    }));

    const sortDate = (i: MovimentoItem) => i.purchaseDate ?? i.date;

    const all = [...entries, ...txs];
    return all.sort((a, b) => {
      const dateCmp = sortDate(a).localeCompare(sortDate(b));
      if (dateCmp !== 0) return dateCmp;
      const ap = a.position, bp = b.position;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      return 0;
    });
  });

  readonly filteredItems = computed<MovimentoItem[]>(() => {
    return this.allItems().filter(item => {
      const tipos = this.filterTipos();
      if (tipos.size > 0 && !tipos.has(item.kind)) return false;
      const statuses = this.filterStatuses();
      if (statuses.size > 0 && !statuses.has(item.status)) return false;
      if (this.filterCategoryId() && item.categoryId !== this.filterCategoryId()) return false;
      const cardIds = this.filterCardIds();
      if (cardIds.size > 0 && item.kind === 'transaction' && !cardIds.has(item.creditCardId ?? '')) return false;
      return true;
    });
  });

  // Totais server-side (sem limite de 1000 linhas)
  readonly periodTotals = signal<{ totalEntries: number; totalTransactions: number } | null>(null);
  readonly balanceInRange = signal<number>(0);
  readonly savingsPeriodTotals = signal<{ deposits: number; withdrawals: number }>({ deposits: 0, withdrawals: 0 });
  readonly preloadedBalance = signal<{ available: number; projected: number } | null>(null);
  readonly savingsBalance = signal<{ available: number; projected: number } | null>(null);

  readonly totalEntradas = computed(() => this.allEntries().reduce((s, e) => s + e.amount, 0));
  readonly totalSaidas   = computed(() => this.allTransactions().reduce((s, t) => s + t.amount, 0));
  readonly totalSaidasRealizadas = computed(() =>
    this.allTransactions().filter(t => t.status === 'REALIZED').reduce((s, t) => s + t.amount, 0));
  readonly totalSaidasProjetadas = computed(() =>
    this.allTransactions().filter(t => t.status === 'PROJECTED' || t.status === 'ESTIMATED').reduce((s, t) => s + t.amount, 0));
  readonly saldo         = computed(() => this.totalEntradas() - this.totalSaidas());
  readonly totalSavingsDeposits    = computed(() => this.savingsPeriodTotals().deposits);
  readonly totalSavingsWithdrawals = computed(() => this.savingsPeriodTotals().withdrawals);
  readonly saldoPoupanca = computed(() => this.totalSavingsDeposits() - this.totalSavingsWithdrawals());

  // Account type separation
  private isSavingsType(typeId: string): boolean {
    const type = this.accountTypes().find(t => t.id === typeId);
    if (!type) return false;
    const v = type.value.toLowerCase();
    const n = type.name.toLowerCase();
    return v.includes('saving') || v.includes('poupan') || n.includes('poupan') || n.includes('saving');
  }

  readonly checkingAccounts = computed(() => this.accounts().filter(a => !this.isSavingsType(a.typeId)));
  readonly savingsAccounts  = computed(() => this.accounts().filter(a =>  this.isSavingsType(a.typeId)));

  // Carousel state
  readonly ccIndex      = signal(0);
  readonly savingsIndex = signal(0);

  readonly ccPerAccountBalances      = signal<Array<{ account: Account; available: number; projected: number }>>([]);
  readonly savingsPerAccountBalances = signal<Array<{ account: Account; available: number; projected: number }>>([]);

  readonly ccShowCarousel      = computed(() => this.checkingAccounts().length >= 2);
  readonly savingsShowCarousel = computed(() => this.savingsAccounts().length >= 2);
  readonly ccTotalSlides       = computed(() => this.checkingAccounts().length + 1);
  readonly savingsTotalSlides  = computed(() => this.savingsAccounts().length + 1);

  readonly ccCurrentSlide = computed(() => {
    const idx = this.ccIndex();
    if (idx === 0) return null;
    return this.ccPerAccountBalances()[idx - 1] ?? null;
  });

  readonly savingsCurrentSlide = computed(() => {
    const idx = this.savingsIndex();
    if (idx === 0) return null;
    return this.savingsPerAccountBalances()[idx - 1] ?? null;
  });

  readonly ccAvailable  = computed(() => this.ccCurrentSlide()?.available  ?? (this.preloadedBalance()?.available ?? 0));
  readonly ccProjected  = computed(() => this.ccCurrentSlide()?.projected  ?? (this.preloadedBalance()?.projected ?? 0));
  readonly savAvailable = computed(() => this.savingsCurrentSlide()?.available ?? (this.savingsBalance()?.available ?? 0));
  readonly savProjected = computed(() => this.savingsCurrentSlide()?.projected ?? (this.savingsBalance()?.projected ?? 0));
  readonly ccLabel      = computed(() => this.ccCurrentSlide()?.account.name ?? '');
  readonly savLabel     = computed(() => this.savingsCurrentSlide()?.account.name ?? '');

  ccNext():      void { this.ccIndex.update(i => Math.min(i + 1, this.ccTotalSlides() - 1)); }
  ccPrev():      void { this.ccIndex.update(i => Math.max(i - 1, 0)); }
  savingsNext(): void { this.savingsIndex.update(i => Math.min(i + 1, this.savingsTotalSlides() - 1)); }
  savingsPrev(): void { this.savingsIndex.update(i => Math.max(i - 1, 0)); }

  dotsArray(n: number): number[] { return Array.from({ length: n }); }

  // Drag/swipe support
  private ccDragStartX: number | null = null;
  private savingsDragStartX: number | null = null;

  onCCPointerDown(e: PointerEvent): void   { this.ccDragStartX = e.clientX; }
  onCCPointerUp(e: PointerEvent): void     { this._applyDrag(e.clientX, this.ccDragStartX, () => this.ccNext(), () => this.ccPrev()); this.ccDragStartX = null; }
  onSavPointerDown(e: PointerEvent): void  { this.savingsDragStartX = e.clientX; }
  onSavPointerUp(e: PointerEvent): void    { this._applyDrag(e.clientX, this.savingsDragStartX, () => this.savingsNext(), () => this.savingsPrev()); this.savingsDragStartX = null; }

  private _applyDrag(endX: number, startX: number | null, onLeft: () => void, onRight: () => void): void {
    if (startX === null) return;
    const delta = endX - startX;
    if (Math.abs(delta) > 50) delta < 0 ? onLeft() : onRight();
  }

  // UI state
  readonly headerExpanded  = signal(true);
  readonly summaryExpanded = signal(true);
  readonly pieExpanded     = signal(true);


  // Multi-seleção
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly allSelected = computed(() =>
    this.filteredItems().length > 0 &&
    this.filteredItems().every(i => this.selectedIds().has(i.id))
  );
  readonly selectionCount = computed(() => this.selectedIds().size);

  readonly tableSearchFn: GroupSearchFn<MovimentoItem> = (item, q) =>
    item.description.toLowerCase().includes(q) ||
    this.categoryName(item.categoryId).toLowerCase().includes(q) ||
    this.payerName(item).toLowerCase().includes(q);

  readonly activeInsert = signal<GroupInsertEvent | null>(null);

  readonly tableGroups = computed<TableGroup<MovimentoItem>[]>(() => {
    const items = this.filteredItems();
    const entries   = items.filter(i => i.kind === 'entry');
    const debitTxs  = items.filter(i => i.kind === 'transaction' && !i.creditCardId);
    const cardTxs   = items.filter(i => i.kind === 'transaction' && !!i.creditCardId);

    const cardMap = new Map<string, MovimentoItem[]>();
    for (const tx of cardTxs) {
      const cid = tx.creditCardId!;
      if (!cardMap.has(cid)) cardMap.set(cid, []);
      cardMap.get(cid)!.push(tx);
    }

    // Group debit transactions by account
    const debitMap = new Map<string, MovimentoItem[]>();
    for (const tx of debitTxs) {
      const key = tx.accountId ?? '__no_account';
      if (!debitMap.has(key)) debitMap.set(key, []);
      debitMap.get(key)!.push(tx);
    }

    const groups: TableGroup<MovimentoItem>[] = [];

    if (entries.length > 0) {
      groups.push({
        id: '__entries',
        label: 'Entradas',
        items: entries,
        total: entries.reduce((s, e) => s + e.amount, 0),
        status: entries.some(e => e.status === 'PROJECTED') ? 'PROJECTED' : 'REALIZED',
        defaultExpanded: false,
      });
    }

    for (const [accountId, txs] of debitMap) {
      const account = this.accounts().find(a => a.id === accountId);
      groups.push({
        id: `__debit_${accountId}`,
        label: account ? `Débito ${account.name}` : 'Débito',
        items: txs,
        total: txs.reduce((s, t) => s + t.amount, 0),
        status: txs.some(t => t.status === 'PROJECTED') ? 'PROJECTED' : 'REALIZED',
        defaultExpanded: false,
      });
    }

    const cardGroups: TableGroup<MovimentoItem>[] = [];
    for (const [cardId, txs] of cardMap) {
      const card = this.cards().find(c => c.id === cardId);
      const rawName = card?.name ?? '...';
      const isDebitCard = /^d[eé]bito/i.test(rawName);
      const hasOpen = txs.some(t => t.status !== 'REALIZED');

      if (isDebitCard) {
        // Treat debit-named cards as a debit group (placed before credit card groups)
        groups.push({
          id: `__debit_card_${cardId}`,
          label: rawName,
          items: txs,
          total: txs.filter(t => t.status !== 'ESTIMATED').reduce((s, t) => s + t.amount, 0),
          status: hasOpen ? 'PROJECTED' : 'REALIZED',
          defaultExpanded: false,
        });
      } else {
        const displayName = rawName.replace(/^cr[eé]dito\s*/i, '');
        const bill = this.bills().find(b => b.creditCardId === cardId);
        const billBadge = bill?.status === BillStatus.Paid ? 'paga'
          : bill?.status === BillStatus.Closed ? 'fechada' : 'em aberto';
        const billBadgeClass = bill?.status === BillStatus.Paid ? 'badge--paid'
          : bill?.status === BillStatus.Closed ? 'badge--closed' : 'badge--open';
        cardGroups.push({
          id: cardId,
          label: `Fatura ${displayName}`,
          items: txs,
          total: txs.filter(t => t.status !== 'ESTIMATED').reduce((s, t) => s + t.amount, 0),
          status: hasOpen ? 'PROJECTED' : 'REALIZED',
          badge: billBadge,
          badgeClass: billBadgeClass,
          defaultExpanded: false,
          meta: bill ?? null,
        });
      }
    }
    cardGroups.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    return [...groups, ...cardGroups];
  });

  toggleDndMode(): void {
    this.dndMode.update(v => !v);
  }

  private pendingInsertAfter: string | null = null;

  onInsertRequested(event: GroupInsertEvent): void {
    this.pendingInsertAfter = event.afterItemId;
    if (event.groupId === '__entries') {
      this.openCreateEntry();
    } else if (event.groupId.startsWith('__debit_')) {
      this.openCreateTransaction();
      const accountId = event.groupId.replace('__debit_', '').replace('card_', '');
      if (accountId !== '__no_account') this.formTxAccountId = accountId;
    } else {
      this.openCreateTransaction();
      this.formTxCreditCardId = event.groupId;
      this.applyCardDates(event.groupId);
    }
  }

  applyCardDates(cardId: string): void {
    const card = this.cards().find(c => c.id === cardId);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    this.formTxPurchaseDate = todayStr;
    if (!card || /^d[eé]bito/i.test(card.name)) {
      this.formTxDate = todayStr;
      return;
    }
    // Credit: payment date = selected month + card due day (clamped to last day of month)
    const y = this.year();
    const m = this.month();
    const lastDay = new Date(y, m, 0).getDate();
    const dueDay = Math.min(card.dueDay, lastDay);
    this.formTxDate = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  }

  private computeInsertPosition(items: MovimentoItem[]): number | undefined {
    const afterId = this.pendingInsertAfter;
    this.pendingInsertAfter = null;
    if (!afterId) return undefined;
    const posOf = (item: MovimentoItem | undefined) =>
      item ? (item.position ?? (items.indexOf(item) + 1) * 1000) : null;
    const afterIdx = items.findIndex(i => i.id === afterId);
    const above = items[afterIdx];
    const below = items[afterIdx + 1];
    const posAbove = posOf(above);
    const posBelow = posOf(below);
    if (posAbove === null) return undefined;
    if (posBelow === null) return posAbove + 1000;
    return (posAbove + posBelow) / 2;
  }

  onRowReordered(event: GroupReorderEvent): void {
    const allItems = this.allItems();
    const draggedItem = allItems.find(i => i.id === event.id);
    if (!draggedItem) return;

    const sortDateOf = (item: MovimentoItem) => item.purchaseDate ?? item.date;
    const draggedSortDate = sortDateOf(draggedItem);

    const groupItems = (this.tableGroups().find(g => g.id === event.groupId)?.items ?? []) as MovimentoItem[];

    // Positions are only meaningful as tiebreakers within items sharing the same sort-date.
    // Using neighbors from different dates produces incorrect midpoint values.
    const sameDateItems = groupItems.filter(gi => sortDateOf(gi) === draggedSortDate);

    const effectivePos = new Map<string, number>();
    sameDateItems.forEach((gi, idx) => {
      effectivePos.set(gi.id, gi.position ?? (idx + 1) * 1000);
    });

    const posOf = (id: string | null | undefined) => id ? (effectivePos.get(id) ?? null) : null;
    const ap = posOf(event.aboveId);
    const bp = posOf(event.belowId);

    // If neither neighbor shares the dragged item's date, the drag has no ordering effect.
    if (ap == null && bp == null) return;

    let newPosition: number;
    if (ap == null) {
      newPosition = bp! - 1000;
    } else if (bp == null) {
      newPosition = ap + 1000;
    } else {
      newPosition = (ap + bp) / 2;
    }

    // Assign synthetic positions to same-date peers that currently lack one.
    const neighborsToSave = sameDateItems.filter(gi => gi.id !== event.id && gi.position == null);

    this.zone.run(() => {
      let entries = this.allEntries();
      let txs = this.allTransactions();
      for (const gi of neighborsToSave) {
        const pos = effectivePos.get(gi.id)!;
        if (gi.kind === 'entry') entries = entries.map(e => e.id === gi.id ? { ...e, position: pos } : e);
        else txs = txs.map(t => t.id === gi.id ? { ...t, position: pos } : t);
      }
      if (draggedItem.kind === 'entry') entries = entries.map(e => e.id === event.id ? { ...e, position: newPosition } : e);
      else txs = txs.map(t => t.id === event.id ? { ...t, position: newPosition } : t);
      this.allEntries.set(entries);
      this.allTransactions.set(txs);
      this.cdr.markForCheck();
    });

    const neighborSaves = neighborsToSave.map(gi => {
      const pos = effectivePos.get(gi.id)!;
      return gi.kind === 'entry'
        ? this.entryService.updatePosition(gi.id, pos)
        : this.transactionService.updatePosition(gi.id, pos);
    });

    const save$ = draggedItem.kind === 'entry'
      ? this.entryService.updatePosition(event.id, newPosition)
      : this.transactionService.updatePosition(event.id, newPosition);

    Promise.all([...neighborSaves, save$])
      .then(() => this.load(true))
      .catch((err: unknown) => {
        this.logger.error('Failed to update position', err);
        this.toast.error('Erro ao salvar posição: ' + ((err as { message?: string })?.message ?? String(err)));
      });
  }

  selectedCardIsCredit(): boolean {
    if (!this.formTxCreditCardId) return false;
    const card = this.cards().find(c => c.id === this.formTxCreditCardId);
    return !!card && !/^d[eé]bito/i.test(card.name);
  }

  toggleFilterTipo(kind: string): void {
    this.filterTipos.update(s => { const n = new Set(s); n.has(kind) ? n.delete(kind) : n.add(kind); return n; });
  }
  toggleFilterStatus(status: string): void {
    this.filterStatuses.update(s => { const n = new Set(s); n.has(status) ? n.delete(status) : n.add(status); return n; });
  }
  toggleFilterCard(id: string): void {
    this.filterCardIds.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  clearFilters(): void {
    this.filterTipos.set(new Set());
    this.filterStatuses.set(new Set());
    this.filterCategoryId.set('');
    this.filterCardIds.set(new Set());
  }

  gridSumEntradas(items: MovimentoItem[]): number {
    return items.filter(i => i.kind === 'entry').reduce((s, i) => s + i.amount, 0);
  }
  gridSumSaidas(items: MovimentoItem[]): number {
    return items.filter(i => i.kind === 'transaction').reduce((s, i) => s + i.amount, 0);
  }
  gridNet(items: MovimentoItem[]): number {
    return this.gridSumEntradas(items) - this.gridSumSaidas(items);
  }

  // Edit modal tabs
  readonly editModalTab = signal<'details' | 'installments'>('details');
  readonly editInstallments = signal<(Entry | Transaction)[]>([]);
  readonly installmentsLoading = signal(false);
  readonly installmentsPage = signal(0);
  readonly installmentsPageSize = 10;
  readonly installmentsPageData = computed(() => {
    const page = this.installmentsPage();
    const size = this.installmentsPageSize;
    return this.editInstallments().slice(page * size, (page + 1) * size);
  });
  readonly installmentsTotalPages = computed(() =>
    Math.ceil(this.editInstallments().length / this.installmentsPageSize)
  );
  readonly editingHasInstallments = signal(false);

  // Single delete confirm
  readonly deletingItem = signal<MovimentoItem | null>(null);

  // Bulk actions
  readonly bulkActionOpen = signal<'delete' | 'amount' | 'move' | 'status' | 'date' | null>(null);
  bulkNewAmount = 0;
  bulkTargetYear = new Date().getFullYear();
  bulkTargetMonth = new Date().getMonth() + 1;
  bulkNewDate = '';
  readonly bulkSaving = signal(false);

  // Gráfico de pizza: saídas por categoria (respeita o filtro atual)
  readonly categorySpend = computed(() => {
    const map = new Map<string, number>();
    for (const item of this.filteredItems()) {
      if (item.kind !== 'transaction') continue;
      const key = item.categoryId || '__sem__';
      map.set(key, (map.get(key) ?? 0) + item.amount);
    }
    return [...map.entries()]
      .map(([categoryId, amount]) => ({
        categoryId,
        name: categoryId === '__sem__' ? 'Sem categoria' : this.categoryName(categoryId) || 'Sem categoria',
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

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.refreshBalanceCards());
    });
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const qYear  = qp.get('year');
    const qMonth = qp.get('month');
    if (qYear)  this.year.set(+qYear);
    if (qMonth) this.month.set(+qMonth);
    this.categoryService.getAll().then(d => this.categories.set(d));
    this.accountService.getAll().then(d => this.accounts.set(d));
    this.cardService.getAll().then(d => this.cards.set(d));
    this.domainListService.getByCode('entry_type').then(d => this.entryTypes.set(d));
    this.domainListService.getByCode('account_type').then(d => this.accountTypes.set(d));
    if (qYear || qMonth) {
      this.applyMonth(this.year(), this.month());
    } else {
      this.load();
    }
  }

  updateBillStatus(bill: CreditCardBill, status: BillStatus): void {
    this.billUpdatingId.set(bill.id);
    this.billService.updateStatus(bill.id, status)
      .then(updated => {
        this.bills.update(list => list.map(b => b.id === updated.id ? { ...b, ...updated } : b));
        const txStatus = status === BillStatus.Paid ? TransactionStatus.Realized
          : status === BillStatus.Open ? TransactionStatus.Projected : null;
        if (txStatus && bill.creditCardId) {
          this.transactionService.bulkUpdateStatusByCardMonth(
            bill.creditCardId, this.year(), this.month(), txStatus
          ).then(() => {
            this.allTransactions.update(list =>
              list.map(t => t.creditCardId === bill.creditCardId ? { ...t, status: txStatus } : t)
            );
            this.balanceService.invalidate();
            this.cdr.markForCheck();
          }).catch((err: unknown) => this.logger.error('Bulk status update failed', err));
        }
        this.billUpdatingId.set(null);
        this.toast.success('Status da fatura atualizado.');
        this.cdr.markForCheck();
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to update bill status', err);
        this.billUpdatingId.set(null);
        this.toast.error('Erro ao atualizar status da fatura.');
      });
  }

  nextBillStatus(current: BillStatus): BillStatus {
    return current === BillStatus.Open ? BillStatus.Closed
      : current === BillStatus.Closed ? BillStatus.Paid
      : BillStatus.Open;
  }

  nextBillStatusLabel(current: BillStatus): string {
    return current === BillStatus.Open ? 'Fechar Fatura'
      : current === BillStatus.Closed ? 'Marcar como Pago'
      : 'Reabrir';
  }

  async load(silent = false): Promise<void> {
    const from = this.dateFrom();
    const to = this.dateTo();
    if (!from || !to || from > to) return;

    if (!silent) this.loading.set(true);
    const uid = this.auth.currentUser!.id;

    try {
      const now = new Date();
      const isCurrent = +this.year() === now.getFullYear() && +this.month() === now.getMonth() + 1;
      const endOfMonth = new Date(+this.year(), +this.month(), 0).toISOString().split('T')[0];
      const today = now.toISOString().split('T')[0];

      const [entriesRes, txsRes, totalsRes, rangeBalanceRes, savingsTotals, availableRes, projectedRes, savingsAvailableRes, savingsProjectedRes] = await Promise.all([
        this.supabase.client
          .from('entries')
          .select('*')
          .eq('owner_id', uid)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('position', { ascending: true, nullsFirst: false })
          .range(0, 9999),
        this.supabase.client
          .from('transactions')
          .select('*')
          .eq('owner_id', uid)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('position', { ascending: true, nullsFirst: false })
          .range(0, 9999),
        this.supabase.client.rpc('get_period_totals', { start_date: from, end_date: to }),
        this.supabase.client.rpc('get_balance_in_range', { start_date: from, end_date: to }),
        this.savingsService.getPeriodTotals(from, to),
        // Para o balance card: busca available e projected em paralelo com o resto
        isCurrent
          ? this.balanceService.getAvailableBalance()
          : this.balanceService.getBalanceUpTo(endOfMonth),
        this.balanceService.getBalanceUpTo(endOfMonth),
        this.savingsService.getBalanceUpTo(today),
        this.savingsService.getBalanceUpTo(endOfMonth),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (txsRes.error) throw txsRes.error;

      const totalsRow = Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data;
      this.periodTotals.set({
        totalEntries: Number(totalsRow?.total_entries ?? 0),
        totalTransactions: Number(totalsRow?.total_transactions ?? 0),
      });
      this.balanceInRange.set(Number(rangeBalanceRes.data ?? 0));
      this.savingsPeriodTotals.set(savingsTotals ?? { deposits: 0, withdrawals: 0 });
      this.preloadedBalance.set({ available: Number(availableRes ?? 0), projected: Number(projectedRes ?? 0) });
      this.savingsBalance.set({ available: Number(savingsAvailableRes ?? 0), projected: Number(savingsProjectedRes ?? 0) });

      this.allEntries.set((entriesRes.data ?? []).map((r: any) => {
        const installMatch = r.description?.match(/ - (\d+)\/(\d+)$/);
        return {
          id: r.id, ownerId: r.owner_id, description: r.description,
          amount: r.amount, date: r.date, status: r.status,
          typeId: r.type_id, accountId: r.account_id,
          labels: r.labels ?? [], position: r.position ?? undefined,
          installmentNumber: installMatch ? parseInt(installMatch[1]) : null,
          totalInstallments: installMatch ? parseInt(installMatch[2]) : null,
          createdAt: r.created_at, updatedAt: r.updated_at,
        } as Entry;
      }));

      this.allTransactions.set((txsRes.data ?? []).map((r: any) => {
        const total: number | null = r.total_installments ?? null;
        let instNum: number | null = r.installment_number ?? null;
        if (total && total > 1) {
          const m = /\s(\d{1,3})\/\d{1,3}$/.exec((r.description ?? '').trim());
          if (m) instNum = parseInt(m[1], 10);
        }
        const tx: Transaction = {
          id: r.id, ownerId: r.owner_id, description: r.description,
          amount: r.amount, date: r.date, purchaseDate: r.purchase_date ?? null, status: r.status,
          categoryId: r.category_id, accountId: r.account_id,
          creditCardId: r.credit_card_id, creditCardBillId: r.credit_card_bill_id,
          installmentNumber: instNum, totalInstallments: total,
          installmentGroupId: r.installment_group_id, recurringTemplateId: r.recurring_template_id,
          originalCurrency: r.original_currency, originalAmount: r.original_amount,
          exchangeRate: r.exchange_rate, paymentDate: r.payment_date,
          paymentMethod: r.payment_method, labels: r.labels ?? [],
          position: r.position ?? undefined,
          createdAt: r.created_at, updatedAt: r.updated_at,
        };
        return tx;
      }));
      this.balanceService.invalidate();

      if (this.periodMode() === 'month') {
        this.billService.getByMonth(this.year(), this.month())
          .then(bills => { this.bills.set(bills); this.cdr.markForCheck(); })
          .catch(() => {});
      } else {
        this.bills.set([]);
      }
    } catch (err) {
      this.logger.error('Failed to load movimentos', err);
      this.toast.error(this.tr('movimentos.toast.loadError'));
    } finally {
      this.loading.set(false);
    }
  }

  onDateChange(): void {
    this.load();
  }

  private async refreshBalanceCards(): Promise<void> {
    const now = new Date();
    const isCurrent = +this.year() === now.getFullYear() && +this.month() === now.getMonth() + 1;
    const endOfMonth = new Date(+this.year(), +this.month(), 0).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    const ccAccs  = this.checkingAccounts();
    const savAccs = this.savingsAccounts();

    const baseQueries: Promise<number>[] = [
      isCurrent ? this.balanceService.getAvailableBalance() : this.balanceService.getBalanceUpTo(endOfMonth),
      this.balanceService.getBalanceUpTo(endOfMonth),
      this.savingsService.getBalanceUpTo(today),
      this.savingsService.getBalanceUpTo(endOfMonth),
    ];

    const ccPerAccQueries: Promise<number>[] = ccAccs.length >= 2 ? [
      ...ccAccs.map(a => isCurrent
        ? this.balanceService.getAvailableBalanceByAccount(a.id, a.balance)
        : this.balanceService.getBalanceUpToByAccount(endOfMonth, a.id, a.balance)),
      ...ccAccs.map(a => this.balanceService.getBalanceUpToByAccount(endOfMonth, a.id, a.balance)),
    ] : [];

    const savPerAccQueries: Promise<number>[] = savAccs.length >= 2 ? [
      ...savAccs.map(a => this.savingsService.getBalanceUpToByAccount(today, a.id)),
      ...savAccs.map(a => this.savingsService.getBalanceUpToByAccount(endOfMonth, a.id)),
    ] : [];

    const results = await Promise.all([...baseQueries, ...ccPerAccQueries, ...savPerAccQueries]);
    const [availableRes, projectedRes, savingsAvailableRes, savingsProjectedRes] = results;

    this.preloadedBalance.set({ available: Number(availableRes ?? 0), projected: Number(projectedRes ?? 0) });
    this.savingsBalance.set({ available: Number(savingsAvailableRes ?? 0), projected: Number(savingsProjectedRes ?? 0) });

    if (ccAccs.length >= 2) {
      const nc = ccAccs.length;
      const off = 4;
      this.ccPerAccountBalances.set(ccAccs.map((acc, i) => ({
        account: acc,
        available: results[off + i],
        projected: results[off + nc + i],
      })));
    }

    if (savAccs.length >= 2) {
      const ns = savAccs.length;
      const off = 4 + (ccAccs.length >= 2 ? ccAccs.length * 2 : 0);
      this.savingsPerAccountBalances.set(savAccs.map((acc, i) => ({
        account: acc,
        available: results[off + i],
        projected: results[off + ns + i],
      })));
    }
  }

  setPeriodMode(mode: 'month' | 'range'): void {
    this.periodMode.set(mode);
    if (mode === 'month') {
      this.applyMonth(this.year(), this.month(), true);
    }
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.applyMonth(e.year, e.month);
  }

  private applyMonth(year: number, month: number, silent = false): void {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.load(silent);
  }

  // Modal helpers
  openCreateEntry(): void {
    this.editingId.set(null);
    this.formEntryDescription = '';
    this.formEntryAmount = 0;
    this.formEntryDate = new Date().toISOString().split('T')[0];
    this.formEntryStatus = 'PROJECTED';
    this.formEntryTypeId = this.entryTypes()[0]?.id ?? '';
    this.formEntryAccountId = '';
    this.formEntryLabels = [];
    this.formEntryIsInstallment = false;
    this.formEntryInstallments = 2;
    this.formEntryAmountType = 'total';
    this.modalMode.set('entry');
  }

  openCreateTransaction(): void {
    this.editingId.set(null);
    this.formTxDescription = '';
    this.formTxAmount = 0;
    this.formTxDate = new Date().toISOString().split('T')[0];
    this.formTxStatus = TransactionStatus.Projected;
    this.formTxCategoryId = '';
    this.formTxAccountId = '';
    this.formTxCreditCardId = '';
    this.formTxPaymentAccountId = this.checkingAccounts()[0]?.id ?? '';
    this.formTxPurchaseDate = new Date().toISOString().split('T')[0];
    this.formTxIsInstallment = false;
    this.formTxInstallments = 2;
    this.formTxAmountType = 'installment';
    this.formTxIsInternational = false;
    this.formTxOriginalCurrency = 'USD';
    this.formTxOriginalAmount = 0;
    this.formTxExchangeRate = 0;
    this.formTxLabels = [];
    this.modalMode.set('transaction');
  }

  duplicate(item: MovimentoItem): void {
    if (item.kind === 'entry') {
      const e = item.raw as Entry;
      this.editingId.set(null);
      this.editModalTab.set('details');
      this.editInstallments.set([]);
      this.installmentsPage.set(0);
      this.editingHasInstallments.set(false);
      this.formEntryDescription = e.description;
      this.formEntryAmount = Math.abs(e.amount);
      this.formEntryDate = e.date;
      this.formEntryStatus = e.status ?? 'REALIZED';
      this.formEntryTypeId = e.typeId ?? '';
      this.formEntryAccountId = e.accountId ?? '';
      this.formEntryLabels = [...e.labels];
      this.modalMode.set('entry');
    } else {
      const t = item.raw as Transaction;
      this.editingId.set(null);
      this.editModalTab.set('details');
      this.editInstallments.set([]);
      this.installmentsPage.set(0);
      this.editingHasInstallments.set(false);
      this.formTxDescription = t.description;
      this.formTxAmount = Math.abs(t.amount);
      this.formTxDate = t.date;
      this.formTxStatus = t.status;
      this.formTxCategoryId = t.categoryId ?? '';
      this.formTxCreditCardId = t.creditCardId ?? '';
      this.formTxAccountId = t.creditCardId ? '' : (t.accountId ?? '');
      this.formTxPaymentAccountId = t.creditCardId ? (t.accountId ?? '') : (this.checkingAccounts()[0]?.id ?? '');
      this.formTxPurchaseDate = t.purchaseDate ?? t.date;
      this.formTxIsInstallment = false;
      this.formTxInstallments = 2;
      this.formTxAmountType = 'installment';
      this.formTxIsInternational = !!t.originalCurrency;
      this.formTxOriginalCurrency = t.originalCurrency ?? 'USD';
      this.formTxOriginalAmount = t.originalAmount ?? 0;
      this.formTxExchangeRate = t.exchangeRate ?? 0;
      this.formTxLabels = [...t.labels];
      this.modalMode.set('transaction');
    }
  }

  openEdit(item: MovimentoItem): void {
    this.editingId.set(item.id);
    this.editModalTab.set('details');
    this.editInstallments.set([]);
    this.installmentsPage.set(0);
    this.editingHasInstallments.set(false);

    if (item.kind === 'entry') {
      const e = item.raw as Entry;
      this.formEntryDescription = e.description;
      this.formEntryAmount = e.amount;
      this.formEntryDate = e.date;
      this.formEntryStatus = e.status ?? 'REALIZED';
      this.formEntryTypeId = e.typeId ?? '';
      this.formEntryAccountId = e.accountId ?? '';
      this.formEntryLabels = [...e.labels];
      this.modalMode.set('entry');

      if (e.totalInstallments && e.totalInstallments > 1) {
        this.editingHasInstallments.set(true);
        const base = e.description.replace(/ - \d+\/\d+$/, '');
        this.installmentsLoading.set(true);
        this.entryService.getByDescriptionPrefix(base).then(list => { this.editInstallments.set(list); this.installmentsLoading.set(false); this.cdr.markForCheck(); }).catch(() => this.installmentsLoading.set(false));
      }
    } else {
      const t = item.raw as Transaction;
      this.formTxDescription = t.description;
      this.formTxAmount = t.amount;
      this.formTxDate = t.date;
      this.formTxStatus = t.status;
      this.formTxCategoryId = t.categoryId ?? '';
      this.formTxCreditCardId = t.creditCardId ?? '';
      this.formTxAccountId = t.creditCardId ? '' : (t.accountId ?? '');
      this.formTxPaymentAccountId = t.creditCardId ? (t.accountId ?? '') : (this.checkingAccounts()[0]?.id ?? '');
      this.formTxPurchaseDate = t.purchaseDate ?? t.date;
      this.formTxIsInstallment = !!t.totalInstallments && t.totalInstallments > 1;
      this.formTxInstallments = t.totalInstallments ?? 1;
      this.formTxAmountType = 'installment';
      this.formTxIsInternational = !!t.originalCurrency;
      this.formTxOriginalCurrency = t.originalCurrency ?? 'USD';
      this.formTxOriginalAmount = t.originalAmount ?? 0;
      this.formTxExchangeRate = t.exchangeRate ?? 0;
      this.formTxLabels = [...t.labels];
      this.modalMode.set('transaction');

      if (t.installmentGroupId) {
        this.editingHasInstallments.set(true);
        this.installmentsLoading.set(true);
        this.transactionService.getByInstallmentGroup(t.installmentGroupId).then(list => { this.editInstallments.set(list); this.installmentsLoading.set(false); this.cdr.markForCheck(); }).catch(() => this.installmentsLoading.set(false));
      }
    }
  }

  // ── Field validation ──────────────────────────────────────────────────────
  saveAttempted = false;
  readonly touchedFields = new Set<string>();

  markTouched(field: string): void {
    this.touchedFields.add(field);
    this.cdr.markForCheck();
  }

  fi(key: string, valid: boolean): boolean {
    return (this.saveAttempted || this.touchedFields.has(key)) && !valid;
  }

  fv(key: string, valid: boolean): boolean {
    return (this.saveAttempted || this.touchedFields.has(key)) && valid;
  }
  // ──────────────────────────────────────────────────────────────────────────

  closeModal(): void {
    this.modalMode.set(null);
    this.editingId.set(null);
    this.saveAttempted = false;
    this.touchedFields.clear();
  }

  saveEntry(): void {
    if (!this.formEntryDescription.trim() || this.formEntryAmount <= 0) {
      this.saveAttempted = true;
      this.cdr.markForCheck();
      return;
    }
    this.saving.set(true);

    const insertPosition = this.computeInsertPosition(this.allItems());

    const payload: CreateEntryPayload = {
      description: this.formEntryDescription.trim(),
      amount: this.formEntryAmount,
      date: this.formEntryDate,
      typeId: this.formEntryTypeId || null,
      accountId: this.formEntryAccountId || null,
      labels: this.formEntryLabels,
      status: this.formEntryStatus,
      totalInstallments: this.formEntryIsInstallment ? this.formEntryInstallments : null,
      installmentAmountIsFixed: this.formEntryIsInstallment && this.formEntryAmountType === 'installment',
      position: insertPosition ?? null,
    };

    const id = this.editingId();
    const op$ = id
      ? this.entryService.update(id, payload)
      : this.entryService.create(payload);

    op$.then((saved: Entry) => {
      this.zone.run(() => {
        this.toast.success(this.tr(id ? 'movimentos.toast.entryUpdated' : 'movimentos.toast.entryAdded'));
        this.saving.set(false);
        this.closeModal();
        if (id) {
          this.allEntries.update(list => list.map(e => e.id === id ? saved : e));
          this.cdr.markForCheck();
        } else {
          this.load(true);
        }
        this.balanceService.invalidate();
      });
    }).catch((err: unknown) => {
      this.logger.error('Failed to save entry', err);
      this.saving.set(false);
      this.toast.error(this.tr('movimentos.toast.entrySaveError'));
    });
  }

  saveTransaction(): void {
    if (!this.formTxDescription.trim() || this.formTxAmount <= 0) {
      this.saveAttempted = true;
      this.cdr.markForCheck();
      return;
    }
    this.saving.set(true);

    const insertPosition = this.computeInsertPosition(this.allItems());
    const id = this.editingId();

    const payload: CreateTransactionPayload = {
      description: this.formTxDescription.trim(),
      amount: this.formTxAmount,
      date: this.selectedCardIsCredit() ? this.formTxDate : this.formTxPurchaseDate,
      purchaseDate: this.selectedCardIsCredit() ? (this.formTxPurchaseDate || null) : null,
      categoryId: this.formTxCategoryId || null,
      accountId: this.formTxCreditCardId ? (this.formTxPaymentAccountId || null) : (this.formTxAccountId || null),
      creditCardId: this.formTxCreditCardId || null,
      status: this.formTxStatus,
      totalInstallments: id ? undefined : (this.formTxIsInstallment ? this.formTxInstallments : null),
      installmentAmountIsFixed: !id && this.formTxIsInstallment && this.formTxAmountType === 'installment',
      recurringTemplateId: null,
      originalCurrency: this.formTxIsInternational ? this.formTxOriginalCurrency : null,
      originalAmount: this.formTxIsInternational ? this.formTxOriginalAmount : null,
      exchangeRate: this.formTxIsInternational ? this.formTxExchangeRate : null,
      labels: this.formTxLabels,
      position: insertPosition ?? null,
    };

    if (id) {
      this.transactionService.update(id, payload).then((saved: Transaction) => {
        this.toast.success(this.tr('movimentos.toast.txUpdated'));
        this.saving.set(false);
        this.closeModal();
        this.allTransactions.update(list => list.map(t => t.id === id ? saved : t));
        this.balanceService.invalidate();
      }).catch((err: unknown) => {
        this.logger.error('Failed to update transaction', err);
        this.saving.set(false);
        this.toast.error(this.tr('movimentos.toast.txUpdateError'));
      });
    } else {
      this.transactionService.create(payload).then(() => {
        this.zone.run(() => {
          this.toast.success(this.tr('movimentos.toast.txAdded'));
          this.saving.set(false);
          this.closeModal();
          this.load(true);
          this.balanceService.invalidate();
        });
      }).catch((err: unknown) => {
        this.logger.error('Failed to create transaction', err);
        this.saving.set(false);
        this.toast.error(this.tr('movimentos.toast.txCreateError'));
      });
    }
  }

  delete(item: MovimentoItem): void {
    this.deletingItem.set(item);
  }

  confirmDelete(): void {
    const item = this.deletingItem();
    if (!item) return;
    const op$ = item.kind === 'entry'
      ? this.entryService.delete(item.id)
      : this.transactionService.delete(item.id);

    op$.then(() => {
      if (item.kind === 'entry') {
        this.allEntries.update(list => list.filter(e => e.id !== item.id));
      } else {
        this.allTransactions.update(list => list.filter(t => t.id !== item.id));
      }
      this.deletingItem.set(null);
      this.preloadedBalance.set(null);
      this.balanceService.invalidate();
      this.toast.success(this.tr('movimentos.toast.deleted'));
    }).catch((err: unknown) => {
      this.logger.error('Failed to delete', err);
      this.deletingItem.set(null);
      this.toast.error(this.tr('movimentos.toast.deleteError'));
    });
  }

  cancelDelete(): void {
    this.deletingItem.set(null);
  }

  setStatus(item: MovimentoItem, newStatus: string): void {
    const status = newStatus as TransactionStatus;
    const apply = () => {
      if (item.kind === 'entry') {
        this.allEntries.update(list => list.map(e => e.id === item.id ? { ...e, status } : e));
      } else {
        this.allTransactions.update(list => list.map(t => t.id === item.id ? { ...t, status } : t));
      }
      this.balanceService.invalidate();
    };
    if (item.kind === 'entry') {
      this.entryService.update(item.id, { status }).then(apply).catch((err: unknown) => this.logger.error('Failed to set status', err));
    } else {
      this.transactionService.update(item.id, { status }).then(apply).catch((err: unknown) => this.logger.error('Failed to set status', err));
    }
  }

  async bulkToggleStatus(): Promise<void> {
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        const newStatus = item.status === 'REALIZED' ? 'PROJECTED' : 'REALIZED'; // ESTIMATED → REALIZED via bulk
        if (item.kind === 'entry') {
          await this.entryService.update(item.id, { status: newStatus as TransactionStatus });
          this.allEntries.update(list => list.map(e => e.id === item.id ? { ...e, status: newStatus as TransactionStatus } : e));
        } else {
          await this.transactionService.update(item.id, { status: newStatus as TransactionStatus });
          this.allTransactions.update(list => list.map(t => t.id === item.id ? { ...t, status: newStatus as TransactionStatus } : t));
        }
      }
      this.clearSelection();
      this.balanceService.invalidate();
      this.toast.success(this.tr('movimentos.toast.statusUpdated'));
    } catch (err) {
      this.logger.error('Bulk status toggle failed', err);
      this.toast.error(this.tr('movimentos.toast.deleteError'));
    } finally {
      this.bulkSaving.set(false);
    }
  }

  // ── Seleção ──────────────────────────────────────────────────────────────
  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.filteredItems().map(i => i.id)));
    }
  }

  private lastClickedIndex = -1;

  toggleItem(id: string, event?: MouseEvent): void {
    const items = this.filteredItems();
    const idx = items.findIndex(i => i.id === id);

    if (event?.shiftKey && this.lastClickedIndex >= 0) {
      const from = Math.min(this.lastClickedIndex, idx);
      const to   = Math.max(this.lastClickedIndex, idx);
      const rangeIds = items.slice(from, to + 1).map(i => i.id);
      this.selectedIds.update(s => {
        const next = new Set(s);
        rangeIds.forEach(rid => next.add(rid));
        return next;
      });
    } else {
      this.selectedIds.update(s => {
        const next = new Set(s);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      this.lastClickedIndex = idx;
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkActionOpen.set(null);
  }

  openBulkAction(action: 'delete' | 'amount' | 'move' | 'status' | 'date'): void {
    this.bulkNewAmount = 0;
    this.bulkTargetYear = new Date().getFullYear();
    this.bulkTargetMonth = new Date().getMonth() + 1;
    this.bulkNewDate = '';
    this.bulkActionOpen.set(action);
  }

  // ── Bulk delete ───────────────────────────────────────────────────────────
  async bulkDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        if (item.kind === 'entry') await this.entryService.delete(item.id);
        else await this.transactionService.delete(item.id);
      }
      this.clearSelection();
      this.toast.success(`${items.length} ${this.tr('movimentos.bulk.deleted')}`);
      this.load();
    } catch (err) {
      this.logger.error('Bulk delete failed', err);
      this.toast.error(this.tr('movimentos.toast.deleteError'));
    } finally {
      this.bulkSaving.set(false);
    }
  }

  // ── Bulk edit amount ───────────────────────────────────────────────────────
  async bulkEditAmount(): Promise<void> {
    if (this.bulkNewAmount <= 0) return;
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        if (item.kind === 'entry') {
          await this.entryService.update(item.id, { amount: this.bulkNewAmount } as any);
        } else {
          await this.transactionService.update(item.id, { amount: this.bulkNewAmount } as any);
        }
      }
      this.clearSelection();
      this.toast.success(`${items.length} ${this.tr('movimentos.bulk.amountUpdated')}`);
      this.load();
    } catch (err) {
      this.logger.error('Bulk amount update failed', err);
      this.toast.error(this.tr('movimentos.toast.txUpdateError'));
    } finally {
      this.bulkSaving.set(false);
    }
  }

  // ── Bulk change date ───────────────────────────────────────────────────────
  async bulkChangeDate(): Promise<void> {
    if (!this.bulkNewDate) return;
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        if (item.kind === 'entry') {
          await this.entryService.update(item.id, { date: this.bulkNewDate } as any);
        } else {
          await this.transactionService.update(item.id, { date: this.bulkNewDate } as any);
        }
      }
      this.clearSelection();
      this.toast.success(`${items.length} ${this.tr('movimentos.bulk.datChanged')}`);
      this.load();
    } catch (err) {
      this.logger.error('Bulk date change failed', err);
      this.toast.error(this.tr('movimentos.toast.txUpdateError'));
    } finally {
      this.bulkSaving.set(false);
    }
  }

  // ── Bulk move month ────────────────────────────────────────────────────────
  async bulkMoveMonth(): Promise<void> {
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    const y = this.bulkTargetYear;
    const m = String(this.bulkTargetMonth).padStart(2, '0');
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        const origDay = item.date.split('-')[2];
        const newDate = `${y}-${m}-${origDay}`;
        if (item.kind === 'entry') {
          await this.entryService.update(item.id, { date: newDate } as any);
        } else {
          await this.transactionService.update(item.id, { date: newDate } as any);
        }
      }
      this.clearSelection();
      this.toast.success(`${items.length} ${this.tr('movimentos.bulk.moved')}`);
      this.load();
    } catch (err) {
      this.logger.error('Bulk move failed', err);
      this.toast.error(this.tr('movimentos.toast.txUpdateError'));
    } finally {
      this.bulkSaving.set(false);
    }
  }

  categoryName(id?: string): string {
    return this.categories().find(c => c.id === id)?.name ?? '';
  }

  categoryColor(id?: string): string {
    return this.categories().find(c => c.id === id)?.color ?? '#e5e7eb';
  }

  accountName(id?: string | null): string {
    return this.accounts().find(a => a.id === id)?.name ?? '';
  }

  cardName(id?: string | null): string {
    return this.cards().find(c => c.id === id)?.name ?? '';
  }

  typeName(id?: string): string {
    return this.entryTypes().find(t => t.id === id)?.name ?? '';
  }

  payerName(item: MovimentoItem): string {
    if (item.kind === 'transaction') {
      return item.creditCardId
        ? this.cardName(item.creditCardId)
        : this.accountName(item.accountId);
    }
    return this.accountName(item.accountId);
  }
}
