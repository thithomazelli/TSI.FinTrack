import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
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
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { BalanceService } from '../../core/services/balance.service';
import { AuthService } from '../../core/auth/auth.service';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { LabelsInputComponent } from '../../shared/components/labels-input/labels-input.component';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { BalanceCardComponent } from '../../shared/components/balance-card/balance-card.component';
import { DataTableComponent, TableColumn, SearchFn, CompareFn, RowClassFn } from '../../shared/components/data-table/data-table.component';
import { ThemeService } from '../../core/services/theme.service';

Chart.register(...registerables);

export interface MovimentoItem {
  kind: 'entry' | 'transaction';
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  categoryId?: string;
  accountId?: string | null;
  creditCardId?: string | null;
  typeId?: string;
  raw: Entry | Transaction;
}

type ModalMode = 'entry' | 'transaction' | null;

@Component({
  selector: 'tsi-movimentos',
  standalone: true,
  imports: [DecimalPipe, DatePipe, FormsModule, LabelsInputComponent, MonthPickerComponent, BaseChartDirective, TranslatePipe, BalanceCardComponent, DataTableComponent],
  templateUrl: './movimentos.component.html',
  styleUrls: ['./movimentos.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovimentosComponent implements OnInit {
  private readonly entryService = inject(EntryService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly cardService = inject(CreditCardService);
  private readonly domainListService = inject(DomainListService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);
  private readonly supabase = inject(SupabaseService);
  private readonly balanceService = inject(BalanceService);
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
  formEntryStatus = 'REALIZED';
  formEntryTypeId = '';
  formEntryAccountId = '';
  formEntryLabels: string[] = [];

  // Transaction form fields
  formTxDescription = '';
  formTxAmount = 0;
  formTxDate = new Date().toISOString().split('T')[0];
  formTxStatus: TransactionStatus = TransactionStatus.Realized;
  formTxCategoryId = '';
  formTxAccountId = '';
  formTxCreditCardId = '';
  formTxIsInstallment = false;
  formTxInstallments = 1;
  formTxIsInternational = false;
  formTxOriginalCurrency = 'USD';
  formTxOriginalAmount = 0;
  formTxExchangeRate = 0;
  formTxLabels: string[] = [];

  // Computed unified list
  readonly allItems = computed<MovimentoItem[]>(() => {
    const entries: MovimentoItem[] = this.allEntries().map(e => ({
      kind: 'entry',
      id: e.id,
      date: e.date,
      description: e.description,
      amount: e.amount,
      status: e.status ?? 'REALIZED',
      accountId: e.accountId,
      typeId: e.typeId,
      raw: e,
    }));

    const txs: MovimentoItem[] = this.allTransactions().map(t => ({
      kind: 'transaction',
      id: t.id,
      date: t.date,
      description: t.description,
      amount: t.amount,
      status: t.status,
      categoryId: t.categoryId,
      accountId: t.accountId,
      creditCardId: t.creditCardId,
      raw: t,
    }));

    return [...entries, ...txs].sort((a, b) => b.date.localeCompare(a.date));
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

  readonly totalEntradas = computed(() =>
    this.filteredItems()
      .filter(i => i.kind === 'entry')
      .reduce((s, i) => s + i.amount, 0)
  );

  readonly totalSaidas = computed(() =>
    this.filteredItems()
      .filter(i => i.kind === 'transaction')
      .reduce((s, i) => s + i.amount, 0)
  );

  readonly saldo = computed(() => this.totalEntradas() - this.totalSaidas());


  // Multi-seleção
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly allSelected = computed(() =>
    this.filteredItems().length > 0 &&
    this.filteredItems().every(i => this.selectedIds().has(i.id))
  );
  readonly selectionCount = computed(() => this.selectedIds().size);

  // DataTable config
  readonly tableColumns: TableColumn[] = [
    { key: 'date',        label: 'common.date',               sortable: true },
    { key: 'kind',        label: 'movimentos.colType',        sortable: false },
    { key: 'description', label: 'common.description',        sortable: true },
    { key: 'categoryId',  label: 'common.category',           sortable: false },
    { key: '_card',       label: 'movimentos.colCardAccount',  sortable: false },
    { key: 'amount',      label: 'common.amount',             sortable: true, numeric: true },
    { key: 'status',      label: 'common.status',             sortable: true },
    { key: '_actions',    label: 'common.actions',            sortable: false },
  ];

  readonly tableSearchFn: SearchFn<MovimentoItem> = (item, q) =>
    item.description.toLowerCase().includes(q) ||
    this.categoryName(item.categoryId).toLowerCase().includes(q) ||
    this.payerName(item).toLowerCase().includes(q);

  readonly tableSortComparators: Record<string, CompareFn<MovimentoItem>> = {
    date:        (a, b) => a.date.localeCompare(b.date),
    description: (a, b) => a.description.localeCompare(b.description, 'pt-BR'),
    amount:      (a, b) => a.amount - b.amount,
    status:      (a, b) => a.status.localeCompare(b.status),
  };

  readonly tableRowClassFn: RowClassFn<MovimentoItem> = (item) => {
    const parts: string[] = [];
    if (item.status === 'PROJECTED') parts.push('row-projected');
    if (this.isSelected(item.id)) parts.push('row-selected');
    return parts.join(' ');
  };

  readonly rowClickFn = (item: MovimentoItem) => this.toggleItem(item.id);

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

  // Bulk actions
  readonly bulkActionOpen = signal<'delete' | 'amount' | 'move' | null>(null);
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

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({ next: d => this.categories.set(d) });
    this.accountService.getAll().subscribe({ next: d => this.accounts.set(d) });
    this.cardService.getAll().subscribe({ next: d => this.cards.set(d) });
    this.domainListService.getByCode('entry_type').subscribe({ next: d => this.entryTypes.set(d) });
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const uid = this.auth.currentUser!.id;
    const from = this.dateFrom();
    const to = this.dateTo();

    try {
      const [entriesRes, txsRes] = await Promise.all([
        this.supabase.client
          .from('entries')
          .select('*')
          .eq('owner_id', uid)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false }),
        this.supabase.client
          .from('transactions')
          .select('*')
          .eq('owner_id', uid)
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false }),
      ]);

      if (entriesRes.error) throw entriesRes.error;
      if (txsRes.error) throw txsRes.error;

      this.allEntries.set((entriesRes.data ?? []).map((r: any) => ({
        id: r.id, ownerId: r.owner_id, description: r.description,
        amount: r.amount, date: r.date, status: r.status,
        typeId: r.type_id, accountId: r.account_id,
        labels: r.labels ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
      }) as Entry));

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
        createdAt: r.created_at, updatedAt: r.updated_at,
      }) as Transaction));
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

  setPeriodMode(mode: 'month' | 'range'): void {
    this.periodMode.set(mode);
    if (mode === 'month') {
      this.applyMonth(this.year(), this.month());
    }
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.applyMonth(e.year, e.month);
  }

  private applyMonth(year: number, month: number): void {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.load();
  }

  // Modal helpers
  openCreateEntry(): void {
    this.editingId.set(null);
    this.formEntryDescription = '';
    this.formEntryAmount = 0;
    this.formEntryDate = new Date().toISOString().split('T')[0];
    this.formEntryStatus = 'REALIZED';
    this.formEntryTypeId = this.entryTypes()[0]?.id ?? '';
    this.formEntryAccountId = '';
    this.formEntryLabels = [];
    this.modalMode.set('entry');
  }

  openCreateTransaction(): void {
    this.editingId.set(null);
    this.formTxDescription = '';
    this.formTxAmount = 0;
    this.formTxDate = new Date().toISOString().split('T')[0];
    this.formTxStatus = TransactionStatus.Realized;
    this.formTxCategoryId = '';
    this.formTxAccountId = '';
    this.formTxCreditCardId = '';
    this.formTxIsInstallment = false;
    this.formTxInstallments = 1;
    this.formTxIsInternational = false;
    this.formTxOriginalCurrency = 'USD';
    this.formTxOriginalAmount = 0;
    this.formTxExchangeRate = 0;
    this.formTxLabels = [];
    this.modalMode.set('transaction');
  }

  openEdit(item: MovimentoItem): void {
    this.editingId.set(item.id);
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
    } else {
      const t = item.raw as Transaction;
      this.formTxDescription = t.description;
      this.formTxAmount = t.amount;
      this.formTxDate = t.date;
      this.formTxStatus = t.status;
      this.formTxCategoryId = t.categoryId ?? '';
      this.formTxAccountId = t.accountId ?? '';
      this.formTxCreditCardId = t.creditCardId ?? '';
      this.formTxIsInstallment = !!t.totalInstallments && t.totalInstallments > 1;
      this.formTxInstallments = t.totalInstallments ?? 1;
      this.formTxIsInternational = !!t.originalCurrency;
      this.formTxOriginalCurrency = t.originalCurrency ?? 'USD';
      this.formTxOriginalAmount = t.originalAmount ?? 0;
      this.formTxExchangeRate = t.exchangeRate ?? 0;
      this.formTxLabels = [...t.labels];
      this.modalMode.set('transaction');
    }
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.editingId.set(null);
  }

  saveEntry(): void {
    if (!this.formEntryDescription.trim() || this.formEntryAmount <= 0) return;
    this.saving.set(true);

    const payload: CreateEntryPayload = {
      description: this.formEntryDescription.trim(),
      amount: this.formEntryAmount,
      date: this.formEntryDate,
      typeId: this.formEntryTypeId || null,
      accountId: this.formEntryAccountId || null,
      labels: this.formEntryLabels,
      status: this.formEntryStatus,
    };

    const id = this.editingId();
    const op$ = id
      ? this.entryService.update(id, payload)
      : this.entryService.create(payload);

    op$.subscribe({
      next: () => {
        this.toast.success(this.tr(id ? 'movimentos.toast.entryUpdated' : 'movimentos.toast.entryAdded'));
        this.saving.set(false);
        this.closeModal();
        this.load();
      },
      error: err => {
        this.logger.error('Failed to save entry', err);
        this.saving.set(false);
        this.toast.error(this.tr('movimentos.toast.entrySaveError'));
      },
    });
  }

  saveTransaction(): void {
    if (!this.formTxDescription.trim() || this.formTxAmount <= 0) return;
    this.saving.set(true);

    const payload: CreateTransactionPayload = {
      description: this.formTxDescription.trim(),
      amount: this.formTxAmount,
      date: this.formTxDate,
      categoryId: this.formTxCategoryId || null,
      accountId: this.formTxCreditCardId ? null : (this.formTxAccountId || null),
      creditCardId: this.formTxCreditCardId || null,
      status: this.formTxStatus,
      totalInstallments: this.formTxIsInstallment ? this.formTxInstallments : null,
      recurringTemplateId: null,
      originalCurrency: this.formTxIsInternational ? this.formTxOriginalCurrency : null,
      originalAmount: this.formTxIsInternational ? this.formTxOriginalAmount : null,
      exchangeRate: this.formTxIsInternational ? this.formTxExchangeRate : null,
      labels: this.formTxLabels,
    };

    const id = this.editingId();

    if (id) {
      this.transactionService.update(id, payload).subscribe({
        next: () => {
          this.toast.success(this.tr('movimentos.toast.txUpdated'));
          this.saving.set(false);
          this.closeModal();
          this.load();
        },
        error: err => {
          this.logger.error('Failed to update transaction', err);
          this.saving.set(false);
          this.toast.error(this.tr('movimentos.toast.txUpdateError'));
        },
      });
    } else {
      this.transactionService.create(payload).subscribe({
        next: () => {
          this.toast.success(this.tr('movimentos.toast.txAdded'));
          this.saving.set(false);
          this.closeModal();
          this.load();
        },
        error: err => {
          this.logger.error('Failed to create transaction', err);
          this.saving.set(false);
          this.toast.error(this.tr('movimentos.toast.txCreateError'));
        },
      });
    }
  }

  delete(item: MovimentoItem): void {
    const op$ = item.kind === 'entry'
      ? this.entryService.delete(item.id)
      : this.transactionService.delete(item.id);

    op$.subscribe({
      next: () => {
        if (item.kind === 'entry') {
          this.allEntries.update(list => list.filter(e => e.id !== item.id));
        } else {
          this.allTransactions.update(list => list.filter(t => t.id !== item.id));
        }
        this.toast.success(this.tr('movimentos.toast.deleted'));
      },
      error: err => {
        this.logger.error('Failed to delete', err);
        this.toast.error(this.tr('movimentos.toast.deleteError'));
      },
    });
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

  openBulkAction(action: 'delete' | 'amount' | 'move'): void {
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
        if (item.kind === 'entry') await this.entryService.delete(item.id).toPromise();
        else await this.transactionService.delete(item.id).toPromise();
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
          await this.entryService.update(item.id, { amount: this.bulkNewAmount } as any).toPromise();
        } else {
          await this.transactionService.update(item.id, { amount: this.bulkNewAmount } as any).toPromise();
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
          await this.entryService.update(item.id, { date: newDate } as any).toPromise();
        } else {
          await this.transactionService.update(item.id, { date: newDate } as any).toPromise();
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
