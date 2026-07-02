import {
  ChangeDetectionStrategy, Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { EntryService } from '../../core/services/entry.service';
import { TransactionService } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { AccountService } from '../../core/services/account.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/auth/auth.service';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { BalanceCardComponent } from '../../shared/components/balance-card/balance-card.component';
import { DataTableComponent, TableColumn, SearchFn, CompareFn, RowClassFn } from '../../shared/components/data-table/data-table.component';

export interface SimItem {
  kind: 'entry' | 'transaction';
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  categoryId?: string;
  creditCardId?: string | null;
  accountId?: string | null;
  raw: Entry | Transaction;
}

interface SimOverride {
  amount?: number;
  date?: string;
  description?: string;
  deleted?: boolean;
}

interface DiffEntry {
  item: SimItem;
  type: 'amount' | 'date' | 'description' | 'deleted';
  originalValue: string;
  newValue: string;
}

@Component({
  selector: 'tsi-simulations',
  standalone: true,
  imports: [DecimalPipe, DatePipe, FormsModule, TranslatePipe, MonthPickerComponent, BalanceCardComponent, DataTableComponent],
  templateUrl: './simulations.component.html',
  styleUrls: ['./simulations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationsComponent implements OnInit {
  private readonly entryService = inject(EntryService);
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly cardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslateService);

  private tr(key: string, params?: object): string { return this.t.instant(key, params); }

  // Reference lists
  readonly categories = signal<Category[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(false);
  readonly applying = signal(false);

  // Period
  readonly periodMode = signal<'month' | 'range'>('month');
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

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

  // Overrides: id → {amount?, date?, deleted?}
  readonly overrides = signal<Map<string, SimOverride>>(new Map());

  // Inline edit state
  readonly editingId = signal<string | null>(null);
  editAmount = 0;
  editDate = '';
  editDescription = '';

  // Multi-select
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly bulkActionOpen = signal<'delete' | 'amount' | 'move' | null>(null);
  bulkNewAmount = 0;
  bulkTargetYear = new Date().getFullYear();
  bulkTargetMonth = new Date().getMonth() + 1;
  readonly bulkSaving = signal(false);

  // Raw real items loaded from DB
  readonly realEntries = signal<Entry[]>([]);
  readonly realTransactions = signal<Transaction[]>([]);

  readonly realItems = computed<SimItem[]>(() => {
    const entries: SimItem[] = this.realEntries().map(e => ({
      kind: 'entry', id: e.id, date: e.date, description: e.description,
      amount: e.amount, status: e.status ?? 'REALIZED',
      accountId: e.accountId, raw: e,
    }));
    const txs: SimItem[] = this.realTransactions().map(t => ({
      kind: 'transaction', id: t.id, date: t.date, description: t.description,
      amount: t.amount, status: t.status, categoryId: t.categoryId,
      creditCardId: t.creditCardId, accountId: t.accountId, raw: t,
    }));
    return [...entries, ...txs].sort((a, b) => b.date.localeCompare(a.date));
  });

  // Apply overrides (no filters yet)
  readonly simulatedItems = computed<SimItem[]>(() => {
    const ovr = this.overrides();
    return this.realItems()
      .filter(i => !ovr.get(i.id)?.deleted)
      .map(i => {
        const o = ovr.get(i.id);
        if (!o) return i;
        return { ...i, amount: o.amount ?? i.amount, date: o.date ?? i.date, description: o.description ?? i.description };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  // Apply filters on top of simulated items
  readonly filteredItems = computed<SimItem[]>(() =>
    this.simulatedItems().filter(item => {
      const tipos = this.filterTipos();
      if (tipos.size > 0 && !tipos.has(item.kind)) return false;
      const statuses = this.filterStatuses();
      if (statuses.size > 0 && !statuses.has(item.status)) return false;
      if (this.filterCategoryId() && item.categoryId !== this.filterCategoryId()) return false;
      const cardIds = this.filterCardIds();
      if (cardIds.size > 0 && item.kind === 'transaction' && !cardIds.has(item.creditCardId ?? '')) return false;
      return true;
    })
  );

  readonly diff = computed<DiffEntry[]>(() => {
    const result: DiffEntry[] = [];
    const ovr = this.overrides();
    for (const [id, o] of ovr.entries()) {
      const item = this.realItems().find(i => i.id === id);
      if (!item) continue;
      if (o.deleted) {
        result.push({ item, type: 'deleted', originalValue: `R$ ${item.amount.toFixed(2)}`, newValue: '—' });
      } else {
        if (o.amount !== undefined && o.amount !== item.amount)
          result.push({ item, type: 'amount', originalValue: `R$ ${item.amount.toFixed(2)}`, newValue: `R$ ${o.amount.toFixed(2)}` });
        if (o.date !== undefined && o.date !== item.date)
          result.push({ item, type: 'date', originalValue: item.date, newValue: o.date });
        if (o.description !== undefined && o.description !== item.description)
          result.push({ item, type: 'description', originalValue: item.description, newValue: o.description });
      }
    }
    return result;
  });

  readonly simEntradas = computed(() =>
    this.simulatedItems().filter(i => i.kind === 'entry').reduce((s, i) => s + i.amount, 0));
  readonly simSaidas = computed(() =>
    this.simulatedItems().filter(i => i.kind === 'transaction').reduce((s, i) => s + i.amount, 0));
  readonly simSaldo = computed(() => this.simEntradas() - this.simSaidas());

  readonly realEntradas = computed(() =>
    this.realItems().filter(i => i.kind === 'entry').reduce((s, i) => s + i.amount, 0));
  readonly realSaidas = computed(() =>
    this.realItems().filter(i => i.kind === 'transaction').reduce((s, i) => s + i.amount, 0));
  readonly realSaldo = computed(() => this.realEntradas() - this.realSaidas());

  readonly hasChanges = computed(() => this.overrides().size > 0);
  readonly deletedItems = computed(() =>
    this.realItems().filter(i => this.overrides().get(i.id)?.deleted));

  readonly allSelected = computed(() =>
    this.filteredItems().length > 0 &&
    this.filteredItems().every(i => this.selectedIds().has(i.id)));
  readonly selectionCount = computed(() => this.selectedIds().size);

  // DataTable config
  readonly tableColumns: TableColumn[] = [
    { key: 'date',        label: 'common.date',              sortable: true },
    { key: 'kind',        label: 'movimentos.colType',       sortable: false },
    { key: 'description', label: 'common.description',       sortable: true },
    { key: 'categoryId',  label: 'common.category',          sortable: false },
    { key: '_card',       label: 'movimentos.colCardAccount', sortable: false },
    { key: 'amount',      label: 'common.amount',            sortable: true, numeric: true },
    { key: '_actions',    label: 'common.actions',           sortable: false },
  ];

  readonly tableSearchFn: SearchFn<SimItem> = (item, q) =>
    item.description.toLowerCase().includes(q) ||
    this.categoryName(item.categoryId).toLowerCase().includes(q) ||
    this.payerName(item).toLowerCase().includes(q);

  readonly tableSortComparators: Record<string, CompareFn<SimItem>> = {
    date:        (a, b) => a.date.localeCompare(b.date),
    description: (a, b) => a.description.localeCompare(b.description, 'pt-BR'),
    amount:      (a, b) => a.amount - b.amount,
  };

  readonly tableRowClassFn: RowClassFn<SimItem> = (item) => {
    const parts: string[] = [];
    if (item.status === 'PROJECTED') parts.push('row-projected');
    if (this.isSelected(item.id)) parts.push('row-selected');
    if (this.isModified(item.id)) parts.push('row-modified');
    return parts.join(' ');
  };

  readonly rowClickFn = (item: SimItem) => this.toggleItem(item.id);

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

  gridSumEntradas(items: SimItem[]): number {
    return items.filter(i => i.kind === 'entry').reduce((s, i) => s + i.amount, 0);
  }
  gridSumSaidas(items: SimItem[]): number {
    return items.filter(i => i.kind === 'transaction').reduce((s, i) => s + i.amount, 0);
  }
  gridNet(items: SimItem[]): number {
    return this.gridSumEntradas(items) - this.gridSumSaidas(items);
  }

  isEditing(id: string): boolean { return this.editingId() === id; }
  isModified(id: string): boolean { return this.overrides().has(id) && !this.overrides().get(id)?.deleted; }
  isSelected(id: string): boolean { return this.selectedIds().has(id); }

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({ next: d => this.categories.set(d) });
    this.cardService.getAll().subscribe({ next: d => this.cards.set(d) });
    this.accountService.getAll().subscribe({ next: d => this.accounts.set(d) });
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
    this.resetSim();
    this.load();
  }

  onDateChange(): void {
    this.resetSim();
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const uid = this.auth.currentUser!.id;
    const from = this.dateFrom();
    const to = this.dateTo();
    try {
      const [eRes, tRes] = await Promise.all([
        this.supabase.client.from('entries').select('*').eq('owner_id', uid).gte('date', from).lte('date', to).order('date', { ascending: false }),
        this.supabase.client.from('transactions').select('*').eq('owner_id', uid).gte('date', from).lte('date', to).order('date', { ascending: false }),
      ]);
      if (eRes.error) throw eRes.error;
      if (tRes.error) throw tRes.error;
      this.realEntries.set((eRes.data ?? []).map((r: any) => ({
        id: r.id, ownerId: r.owner_id, description: r.description, amount: r.amount,
        date: r.date, status: r.status, typeId: r.type_id, accountId: r.account_id,
        labels: r.labels ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
      }) as Entry));
      this.realTransactions.set((tRes.data ?? []).map((r: any) => ({
        id: r.id, ownerId: r.owner_id, description: r.description, amount: r.amount,
        date: r.date, status: r.status, categoryId: r.category_id, accountId: r.account_id,
        creditCardId: r.credit_card_id, installmentNumber: r.installment_number,
        totalInstallments: r.total_installments, labels: r.labels ?? [],
        createdAt: r.created_at, updatedAt: r.updated_at,
      }) as Transaction));
    } catch (err) {
      this.logger.error('Failed to load simulation data', err);
    } finally {
      this.loading.set(false);
    }
  }

  // ── Inline edit ─────────────────────────────────────────────────────────────
  startEdit(item: SimItem): void {
    this.editingId.set(item.id);
    const ovr = this.overrides().get(item.id);
    this.editAmount = ovr?.amount ?? item.amount;
    this.editDate = ovr?.date ?? item.date;
    this.editDescription = ovr?.description ?? item.description;
  }

  cancelEdit(): void { this.editingId.set(null); }

  applyEdit(item: SimItem): void {
    const changed = this.editAmount !== item.amount
      || this.editDate !== item.date
      || this.editDescription.trim() !== item.description;
    if (!changed) { this.cancelEdit(); return; }
    this.overrides.update(m => {
      const next = new Map(m);
      const o: SimOverride = { ...(next.get(item.id) ?? {}) };
      if (this.editAmount !== item.amount) o.amount = this.editAmount;
      if (this.editDate !== item.date) o.date = this.editDate;
      if (this.editDescription.trim() !== item.description) o.description = this.editDescription.trim();
      next.set(item.id, o);
      return next;
    });
    this.cancelEdit();
  }

  deleteItem(item: SimItem): void {
    this.overrides.update(m => {
      const next = new Map(m);
      next.set(item.id, { ...(next.get(item.id) ?? {}), deleted: true });
      return next;
    });
    this.selectedIds.update(s => { const n = new Set(s); n.delete(item.id); return n; });
  }

  restoreItem(id: string): void {
    this.overrides.update(m => {
      const next = new Map(m);
      const o = { ...(next.get(id) ?? {}) };
      delete o.deleted;
      if (Object.keys(o).length === 0) next.delete(id);
      else next.set(id, o);
      return next;
    });
  }

  removeDiff(d: DiffEntry): void {
    this.overrides.update(m => {
      const next = new Map(m);
      const o = { ...(next.get(d.item.id) ?? {}) };
      if (d.type === 'amount') delete o.amount;
      if (d.type === 'date') delete o.date;
      if (d.type === 'description') delete o.description;
      if (d.type === 'deleted') delete o.deleted;
      if (Object.keys(o).length === 0) next.delete(d.item.id);
      else next.set(d.item.id, o);
      return next;
    });
  }

  resetSim(): void { this.overrides.set(new Map()); this.editingId.set(null); this.clearSelection(); }

  // ── Multi-select ─────────────────────────────────────────────────────────────
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

  bulkSimDelete(): void {
    const ids = [...this.selectedIds()];
    this.overrides.update(m => {
      const next = new Map(m);
      for (const id of ids) next.set(id, { ...(next.get(id) ?? {}), deleted: true });
      return next;
    });
    const count = ids.length;
    this.clearSelection();
    this.toast.success(`${count} ${this.tr('movimentos.bulk.deleted')}`);
  }

  bulkSimAmount(): void {
    if (this.bulkNewAmount <= 0) return;
    const ids = [...this.selectedIds()];
    this.overrides.update(m => {
      const next = new Map(m);
      for (const id of ids) next.set(id, { ...(next.get(id) ?? {}), amount: this.bulkNewAmount });
      return next;
    });
    const count = ids.length;
    this.clearSelection();
    this.toast.success(`${count} ${this.tr('movimentos.bulk.amountUpdated')}`);
  }

  bulkSimMove(): void {
    const ids = [...this.selectedIds()];
    const y = String(this.bulkTargetYear).padStart(4, '0');
    const mo = String(this.bulkTargetMonth).padStart(2, '0');
    this.overrides.update(m => {
      const next = new Map(m);
      for (const id of ids) {
        const item = this.realItems().find(i => i.id === id);
        const day = item ? item.date.split('-')[2] : '01';
        const lastDay = new Date(this.bulkTargetYear, this.bulkTargetMonth, 0).getDate();
        const clampedDay = String(Math.min(Number(day), lastDay)).padStart(2, '0');
        next.set(id, { ...(next.get(id) ?? {}), date: `${y}-${mo}-${clampedDay}` });
      }
      return next;
    });
    const count = ids.length;
    this.clearSelection();
    this.toast.success(`${count} ${this.tr('movimentos.bulk.moved')}`);
  }

  // ── Apply to DB ─────────────────────────────────────────────────────────────
  async applySimulation(): Promise<void> {
    const changes = this.diff();
    if (!changes.length) return;
    this.applying.set(true);
    try {
      for (const d of changes) {
        const { item } = d;
        if (d.type === 'deleted') {
          if (item.kind === 'entry') await this.entryService.delete(item.id).toPromise();
          else await this.transactionService.delete(item.id).toPromise();
        } else {
          const o = this.overrides().get(item.id)!;
          const payload: any = {};
          if (o.amount !== undefined) payload['amount'] = o.amount;
          if (o.date !== undefined) payload['date'] = o.date;
          if (o.description !== undefined) payload['description'] = o.description;
          if (item.kind === 'entry') await this.entryService.update(item.id, payload).toPromise();
          else await this.transactionService.update(item.id, payload).toPromise();
        }
      }
      this.toast.success(this.tr('simulations.applied', { count: changes.length }));
      this.resetSim();
      this.load();
    } catch (err) {
      this.logger.error('Simulation apply failed', err);
      this.toast.error(this.tr('simulations.applyError'));
    } finally {
      this.applying.set(false);
    }
  }

  categoryName(id?: string): string { return this.categories().find(c => c.id === id)?.name ?? ''; }
  categoryColor(id?: string): string { return this.categories().find(c => c.id === id)?.color ?? '#e5e7eb'; }
  cardName(id?: string | null): string { return this.cards().find(c => c.id === id)?.name ?? ''; }
  accountName(id?: string | null): string { return this.accounts().find(a => a.id === id)?.name ?? ''; }
  payerName(item: SimItem): string {
    if (item.kind === 'transaction') return item.creditCardId ? this.cardName(item.creditCardId) : this.accountName(item.accountId);
    return this.accountName(item.accountId);
  }
}
