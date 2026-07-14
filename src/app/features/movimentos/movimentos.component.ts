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
import { LabelsInputComponent } from '../../shared/components/labels-input/labels-input.component';
import { CurrencyMaskDirective } from '../../shared/directives/currency-mask.directive';
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
    imports: [DecimalPipe, DatePipe, FormsModule, LabelsInputComponent, MonthPickerComponent, BalanceCardComponent, SavingsBalanceCardComponent, BaseChartDirective, TranslatePipe, GroupedTableComponent, CurrencyMaskDirective],
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
  private readonly auth = inject(AuthService);
  readonly themeService = inject(ThemeService);
  private readonly t = inject(TranslateService);

  private tr(key: string): string {
    return this.t.instant(key);
  }

  readonly TransactionStatus = TransactionStatus;

  // Data
  readonly allEntries = signal<Entry[]>([]);
  readonly allTransactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly entryTypes = signal<DomainList[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);

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
  readonly saldo         = computed(() => this.totalEntradas() - this.totalSaidas());
  readonly totalSavingsDeposits    = computed(() => this.savingsPeriodTotals().deposits);
  readonly totalSavingsWithdrawals = computed(() => this.savingsPeriodTotals().withdrawals);
  readonly saldoPoupanca = computed(() => this.totalSavingsDeposits() - this.totalSavingsWithdrawals());

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
        defaultExpanded: true,
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
        defaultExpanded: true,
      });
    }

    const cardGroups: TableGroup<MovimentoItem>[] = [];
    for (const [cardId, txs] of cardMap) {
      const card = this.cards().find(c => c.id === cardId);
      const rawName = card?.name ?? '...';
      const isDebitCard = /^d[eé]bito/i.test(rawName);
      const hasOpen = txs.some(t => t.status === 'PROJECTED');

      if (isDebitCard) {
        // Treat debit-named cards as a debit group (placed before credit card groups)
        groups.push({
          id: `__debit_card_${cardId}`,
          label: rawName,
          items: txs,
          total: txs.reduce((s, t) => s + t.amount, 0),
          status: hasOpen ? 'PROJECTED' : 'REALIZED',
          defaultExpanded: true,
        });
      } else {
        const displayName = rawName.replace(/^cr[eé]dito\s*/i, '');
        cardGroups.push({
          id: cardId,
          label: `Fatura ${displayName}`,
          items: txs,
          total: txs.reduce((s, t) => s + t.amount, 0),
          status: hasOpen ? 'PROJECTED' : 'REALIZED',
          badge: hasOpen ? 'em aberto' : 'fechada',
          badgeClass: hasOpen ? 'badge--open' : 'badge--closed',
          defaultExpanded: false,
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

  private applyCardDates(cardId: string): void {
    const card = this.cards().find(c => c.id === cardId);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    this.formTxPurchaseDate = todayStr;
    if (!card || /^d[eé]bito/i.test(card.name)) {
      // Debit: payment date = purchase date
      this.formTxDate = todayStr;
      return;
    }
    // Credit: payment date = next card due date
    let dueYear = today.getFullYear();
    let dueMonth = today.getMonth() + 1;
    if (today.getDate() > card.dueDay) dueMonth++;
    if (dueMonth > 12) { dueMonth = 1; dueYear++; }
    const dueDay = String(card.dueDay).padStart(2, '0');
    this.formTxDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${dueDay}`;
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
    const aboveItem = event.aboveId ? allItems.find(i => i.id === event.aboveId) : null;
    const belowItem = event.belowId ? allItems.find(i => i.id === event.belowId) : null;
    const draggedItem = allItems.find(i => i.id === event.id);
    if (!draggedItem) return;

    // When items have no saved position yet, synthesize one from their current index
    // so the midpoint calculation places the dragged item correctly.
    const posOf = (item: (typeof allItems)[0] | null | undefined) => {
      if (!item) return null;
      return item.position ?? (allItems.indexOf(item) + 1) * 1000;
    };

    const ap = posOf(aboveItem);
    const bp = posOf(belowItem);

    let newPosition: number;
    if (ap == null && bp == null) {
      newPosition = 1000;
    } else if (ap == null) {
      newPosition = bp! - 1000;
    } else if (bp == null) {
      newPosition = ap + 1000;
    } else {
      newPosition = (ap + bp) / 2;
    }

    const save$ = draggedItem.kind === 'entry'
      ? this.entryService.updatePosition(event.id, newPosition)
      : this.transactionService.updatePosition(event.id, newPosition);

    // Apply position locally and force CD so the view updates immediately
    this.zone.run(() => {
      if (draggedItem.kind === 'entry') {
        this.allEntries.set(
          this.allEntries().map(e => e.id === event.id ? { ...e, position: newPosition } : e)
        );
      } else {
        this.allTransactions.set(
          this.allTransactions().map(t => t.id === event.id ? { ...t, position: newPosition } : t)
        );
      }
      this.cdr.markForCheck();
    });

    // Persist and reload to guarantee visual consistency (silent = no loading spinner)
    save$.then(() => this.load(true)).catch((err: unknown) => this.logger.error('Failed to update position', err));
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
  readonly bulkActionOpen = signal<'delete' | 'amount' | 'move' | 'status' | null>(null);
  bulkNewAmount = 0;
  bulkTargetYear = new Date().getFullYear();
  bulkTargetMonth = new Date().getMonth() + 1;
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
    if (qYear || qMonth) {
      this.applyMonth(this.year(), this.month());
    } else {
      this.load();
    }
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.loading.set(true);
    const uid = this.auth.currentUser!.id;
    const from = this.dateFrom();
    const to = this.dateTo();

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
          .order('position', { ascending: true, nullsFirst: false }),
        this.supabase.client
          .from('transactions')
          .select('*')
          .eq('owner_id', uid)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: true })
          .order('position', { ascending: true, nullsFirst: false }),
        this.supabase.client.rpc('get_period_totals', { start_date: from, end_date: to }),
        this.supabase.client.rpc('get_balance_in_range', { start_date: from, end_date: to }),
        this.savingsService.getPeriodTotals(from, to),
        // Para o balance card: busca available e projected em paralelo com o resto
        isCurrent
          ? this.balanceService.getAvailableBalance()
          : this.balanceService.getBalanceUpTo(endOfMonth),
        this.balanceService.getBalanceUpTo(isCurrent ? endOfMonth : endOfMonth),
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

      this.allTransactions.set((txsRes.data ?? []).map((r: any) => ({
        id: r.id, ownerId: r.owner_id, description: r.description,
        amount: r.amount, date: r.date, status: r.status,
        categoryId: r.category_id, accountId: r.account_id,
        creditCardId: r.credit_card_id, creditCardBillId: r.credit_card_bill_id,
        installmentNumber: r.installment_number, totalInstallments: r.total_installments,
        installmentGroupId: r.installment_group_id, recurringTemplateId: r.recurring_template_id,
        originalCurrency: r.original_currency, originalAmount: r.original_amount,
        exchangeRate: r.exchange_rate, paymentDate: r.payment_date,
        paymentMethod: r.payment_method, labels: r.labels ?? [],
        position: r.position ?? undefined,
        createdAt: r.created_at, updatedAt: r.updated_at,
      }) as Transaction));
      this.balanceService.invalidate();
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
    const [availableRes, projectedRes, savingsAvailableRes, savingsProjectedRes] = await Promise.all([
      isCurrent
        ? this.balanceService.getAvailableBalance()
        : this.balanceService.getBalanceUpTo(endOfMonth),
      this.balanceService.getBalanceUpTo(endOfMonth),
      this.savingsService.getBalanceUpTo(today),
      this.savingsService.getBalanceUpTo(endOfMonth),
    ]);
    this.preloadedBalance.set({ available: Number(availableRes ?? 0), projected: Number(projectedRes ?? 0) });
    this.savingsBalance.set({ available: Number(savingsAvailableRes ?? 0), projected: Number(savingsProjectedRes ?? 0) });
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
    this.formTxPurchaseDate = new Date().toISOString().split('T')[0];
    this.formTxIsInstallment = false;
    this.formTxInstallments = 2;
    this.formTxAmountType = 'total';
    this.formTxIsInternational = false;
    this.formTxOriginalCurrency = 'USD';
    this.formTxOriginalAmount = 0;
    this.formTxExchangeRate = 0;
    this.formTxLabels = [];
    this.modalMode.set('transaction');
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
      this.formTxAccountId = t.accountId ?? '';
      this.formTxCreditCardId = t.creditCardId ?? '';
      this.formTxPurchaseDate = t.purchaseDate ?? t.date;
      this.formTxIsInstallment = !!t.totalInstallments && t.totalInstallments > 1;
      this.formTxInstallments = t.totalInstallments ?? 1;
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

    const payload: CreateTransactionPayload = {
      description: this.formTxDescription.trim(),
      amount: this.formTxAmount,
      date: this.selectedCardIsCredit() ? this.formTxDate : this.formTxPurchaseDate,
      purchaseDate: this.selectedCardIsCredit() ? (this.formTxPurchaseDate || null) : null,
      categoryId: this.formTxCategoryId || null,
      accountId: this.formTxCreditCardId ? null : (this.formTxAccountId || null),
      creditCardId: this.formTxCreditCardId || null,
      status: this.formTxStatus,
      totalInstallments: this.formTxIsInstallment ? this.formTxInstallments : null,
      installmentAmountIsFixed: this.formTxIsInstallment && this.formTxAmountType === 'installment',
      recurringTemplateId: null,
      originalCurrency: this.formTxIsInternational ? this.formTxOriginalCurrency : null,
      originalAmount: this.formTxIsInternational ? this.formTxOriginalAmount : null,
      exchangeRate: this.formTxIsInternational ? this.formTxExchangeRate : null,
      labels: this.formTxLabels,
      position: insertPosition ?? null,
    };

    const id = this.editingId();

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

  toggleStatus(item: MovimentoItem): void {
    const newStatus = (item.status === 'REALIZED' ? 'PROJECTED' : 'REALIZED') as TransactionStatus;
    const apply = () => {
      if (item.kind === 'entry') {
        this.allEntries.update(list => list.map(e => e.id === item.id ? { ...e, status: newStatus } : e));
      } else {
        this.allTransactions.update(list => list.map(t => t.id === item.id ? { ...t, status: newStatus } : t));
      }
      this.balanceService.invalidate();
    };
    if (item.kind === 'entry') {
      this.entryService.update(item.id, { status: newStatus }).then(apply).catch((err: unknown) => this.logger.error('Failed to toggle status', err));
    } else {
      this.transactionService.update(item.id, { status: newStatus }).then(apply).catch((err: unknown) => this.logger.error('Failed to toggle status', err));
    }
  }

  async bulkToggleStatus(): Promise<void> {
    const ids = [...this.selectedIds()];
    const items = this.filteredItems().filter(i => ids.includes(i.id));
    this.bulkSaving.set(true);
    try {
      for (const item of items) {
        const newStatus = item.status === 'REALIZED' ? 'PROJECTED' : 'REALIZED';
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

  toggleItem(id: string): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkActionOpen.set(null);
  }

  openBulkAction(action: 'delete' | 'amount' | 'move' | 'status'): void {
    this.bulkNewAmount = 0;
    this.bulkTargetYear = new Date().getFullYear();
    this.bulkTargetMonth = new Date().getMonth() + 1;
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
