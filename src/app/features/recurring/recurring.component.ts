import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecurringTemplateService } from '../../core/services/recurring-template.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { RecurringTemplate } from '../../core/models/interfaces/recurring-template.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import {
  GroupedTableComponent,
  TableGroup,
  GroupInsertEvent,
  GroupReorderEvent,
  GroupSearchFn,
} from '../../shared/components/grouped-table/grouped-table.component';
import { CurrencyMaskDirective } from '../../shared/directives/currency-mask.directive';
import { ModalKeyDirective } from '../../shared/directives/modal-key.directive';

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

@Component({
  selector: 'tsi-recurring',
  imports: [DecimalPipe, FormsModule, GroupedTableComponent, CurrencyMaskDirective, ModalKeyDirective],
  templateUrl: './recurring.component.html',
  styleUrls: ['./recurring.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringComponent implements OnInit {
  private readonly service = inject(RecurringTemplateService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly templates = signal<RecurringTemplate[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly projecting = signal(false);

  readonly activeInsert = signal<GroupInsertEvent | null>(null);
  readonly editingTemplate = signal<RecurringTemplate | null>(null);
  readonly deletingTemplate = signal<RecurringTemplate | null>(null);
  readonly showProjectModal = signal(false);

  // Form state (used both for inline insert and edit modal)
  formDescription = '';
  formAmount = 0;
  formType: 'TRANSACTION' | 'ENTRY' = 'TRANSACTION';
  formDayOfMonth = 1;
  formCategoryId = '';
  formAccountId = '';
  formCreditCardId = '';
  formIsActive = true;
  formFrequency: 'monthly' | 'sporadic' = 'monthly';
  formMonths: number[] = [];

  // Project modal state
  projectYear = new Date().getFullYear();
  projectFromMonth = new Date().getMonth() + 1;
  projectToMonth = new Date().getMonth() + 1;
  readonly projectSelectedIds = signal(new Set<string>());

  readonly monthNames = MONTH_NAMES;
  readonly days = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly allMonths = Array.from({ length: 12 }, (_, i) => i + 1);

  readonly tableSearchFn: GroupSearchFn<RecurringTemplate> = (item, q) =>
    item.description.toLowerCase().includes(q) ||
    this.categoryName(item.categoryId).toLowerCase().includes(q);

  readonly tableGroups = computed<TableGroup<RecurringTemplate>[]>(() => {
    const templates = this.templates();
    const entries = templates.filter(t => t.type === 'ENTRY');
    const debitTxs = templates.filter(t => t.type === 'TRANSACTION' && !t.creditCardId);
    const cardTxs = templates.filter(t => t.type === 'TRANSACTION' && !!t.creditCardId);

    const groups: TableGroup<RecurringTemplate>[] = [];

    if (entries.length > 0) {
      groups.push({
        id: '__entries',
        label: 'Entradas',
        items: entries,
        defaultExpanded: true,
      });
    }

    // Group debit transactions by account
    const debitMap = new Map<string, RecurringTemplate[]>();
    for (const tx of debitTxs) {
      const key = tx.accountId ?? '__no_account';
      if (!debitMap.has(key)) debitMap.set(key, []);
      debitMap.get(key)!.push(tx);
    }
    for (const [accountId, txs] of debitMap) {
      const account = this.accounts().find(a => a.id === accountId);
      groups.push({
        id: `__debit_${accountId}`,
        label: account ? `Débito ${account.name}` : 'Débito',
        items: txs,
        defaultExpanded: true,
      });
    }

    // Group credit card transactions by card, sorted alphabetically
    const cardMap = new Map<string, RecurringTemplate[]>();
    for (const tx of cardTxs) {
      const cid = tx.creditCardId!;
      if (!cardMap.has(cid)) cardMap.set(cid, []);
      cardMap.get(cid)!.push(tx);
    }
    const cardGroups: TableGroup<RecurringTemplate>[] = [];
    for (const [cardId, txs] of cardMap) {
      const card = this.cards().find(c => c.id === cardId);
      cardGroups.push({
        id: cardId,
        label: `Fatura ${card?.name ?? '...'}`,
        items: txs,
        defaultExpanded: false,
      });
    }
    cardGroups.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    return [...groups, ...cardGroups];
  });

  ngOnInit(): void {
    this.categoryService.getAll().then(d => this.categories.set(d));
    this.accountService.getAll().then(d => this.accounts.set(d));
    this.cardService.getAll().then(d => this.cards.set(d));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.getAll()
      .then(data => { this.templates.set(data); this.loading.set(false); })
      .catch((err: unknown) => {
        this.logger.error('Failed to load recurring templates', err);
        this.toast.error('Erro ao carregar recorrentes: ' + ((err as { message?: string })?.message ?? err));
        this.loading.set(false);
      });
  }

  // ── Insert zone ─────────────────────────────────────────────────────────────

  onInsertRequested(event: GroupInsertEvent): void {
    this.editingTemplate.set(null);
    this.resetForm();
    if (event.groupId === '__entries') {
      this.formType = 'ENTRY';
    } else if (event.groupId.startsWith('__debit_')) {
      this.formType = 'TRANSACTION';
      const accountId = event.groupId.replace('__debit_', '');
      if (accountId !== '__no_account') this.formAccountId = accountId;
    } else {
      this.formType = 'TRANSACTION';
      this.formCreditCardId = event.groupId;
    }
    this.activeInsert.set(event);
  }

  cancelInsert(): void {
    this.activeInsert.set(null);
    this.resetForm();
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  openEdit(t: RecurringTemplate): void {
    this.editingTemplate.set(t);
    this.formDescription = t.description;
    this.formAmount = t.amount;
    this.formType = t.type;
    this.formDayOfMonth = t.dayOfMonth;
    this.formCategoryId = t.categoryId ?? '';
    this.formAccountId = t.accountId ?? '';
    this.formCreditCardId = t.creditCardId ?? '';
    this.formIsActive = t.isActive;
    this.formFrequency = t.frequency;
    this.formMonths = [...t.months];
  }

  readonly saveAttempted = signal(false);
  private readonly _touched = new Set<string>();
  readonly touchedTick = signal(0);
  markTouched(f: string): void { this._touched.add(f); this.touchedTick.update(n => n + 1); }
  fi(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && !v; }
  fv(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && v; }

  closeEdit(): void {
    this.editingTemplate.set(null);
    this.resetForm();
    this.saveAttempted.set(false);
    this._touched.clear();
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  save(): void {
    if (!this.formDescription.trim() || this.formAmount === 0) { this.saveAttempted.set(true); return; }
    this.saving.set(true);

    const editingId = this.editingTemplate()?.id ?? null;

    const payload = {
      description: this.formDescription.trim(),
      amount: this.formAmount,
      type: this.formType,
      dayOfMonth: this.formDayOfMonth,
      categoryId: this.formCategoryId || null,
      accountId: this.formCreditCardId ? null : (this.formAccountId || null),
      creditCardId: this.formCreditCardId || null,
      isActive: this.formIsActive,
      frequency: this.formFrequency,
      months: this.formFrequency === 'sporadic' ? this.formMonths : [],
      position: editingId
        ? (this.editingTemplate()!.position)
        : (this.nextPosition()),
    };

    const op = editingId
      ? this.service.update(editingId, payload)
      : this.service.create(payload);

    op.then(saved => {
        if (editingId) {
          this.templates.update(list => list.map(t => t.id === editingId ? saved : t));
          this.toast.success('Recorrente atualizado!');
          this.closeEdit();
        } else {
          this.templates.update(list => [...list, saved]);
          this.toast.success('Recorrente criado com sucesso!');
          this.cancelInsert();
        }
        this.saving.set(false);
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to save recurring template', err);
        this.saving.set(false);
        const msg = (err as { message?: string })?.message ?? String(err);
        this.toast.error(`Erro ao salvar recorrente: ${msg}`);
      });
  }

  private nextPosition(): number {
    const list = this.templates();
    return list.length === 0 ? 10 : Math.max(...list.map(t => t.position)) + 10;
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  delete(t: RecurringTemplate): void {
    this.deletingTemplate.set(t);
  }

  confirmDelete(): void {
    const t = this.deletingTemplate();
    if (!t) return;
    this.service.delete(t.id)
      .then(() => {
        this.templates.update(list => list.filter(x => x.id !== t.id));
        this.deletingTemplate.set(null);
        this.toast.success('Recorrente excluído.');
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to delete recurring template', err);
        this.deletingTemplate.set(null);
        this.toast.error('Erro ao excluir recorrente.');
      });
  }

  cancelDelete(): void {
    this.deletingTemplate.set(null);
  }

  // ── Toggle active ────────────────────────────────────────────────────────────

  toggleActive(t: RecurringTemplate): void {
    this.service.update(t.id, { isActive: !t.isActive })
      .then(saved => {
        this.templates.update(list => list.map(x => x.id === t.id ? saved : x));
        this.toast.info(saved.isActive ? 'Recorrente ativado.' : 'Recorrente pausado.');
      })
      .catch((err: unknown) => this.logger.error('Failed to toggle recurring', err));
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  onRowReordered(event: GroupReorderEvent): void {
    const list = this.templates();
    const item = list.find(t => t.id === event.id);
    if (!item) return;

    const groupItems = list.filter(t => this.groupIdFor(t) === event.groupId);
    const above = event.aboveId ? groupItems.find(t => t.id === event.aboveId) : null;
    const below = event.belowId ? groupItems.find(t => t.id === event.belowId) : null;

    let newPos: number;
    if (above && below) {
      newPos = (above.position + below.position) / 2;
    } else if (above) {
      newPos = above.position + 10;
    } else if (below) {
      newPos = below.position - 10;
    } else {
      newPos = item.position;
    }

    this.templates.update(list => list.map(t => t.id === event.id ? { ...t, position: newPos } : t));
    this.service.updatePosition(event.id, newPos)
      .catch((err: unknown) => this.logger.error('Failed to update position', err));
  }

  private groupIdFor(t: RecurringTemplate): string {
    if (t.type === 'ENTRY') return '__entries';
    if (t.creditCardId) return t.creditCardId;
    return `__debit_${t.accountId ?? '__no_account'}`;
  }

  // ── Project period ───────────────────────────────────────────────────────────

  /** Active templates that apply to at least one month in the selected range. */
  readonly projectableTemplates = computed(() => {
    const from = this.projectFromMonth;
    const to   = this.projectToMonth;
    const monthsInRange = Array.from(
      { length: Math.max(0, to - from + 1) },
      (_, i) => from + i
    );
    return this.templates().filter(t =>
      t.isActive && (
        t.frequency === 'monthly' ||
        t.months.some(m => monthsInRange.includes(m))
      )
    );
  });

  openProjectModal(): void {
    const now = new Date();
    this.projectYear     = now.getFullYear();
    this.projectFromMonth = now.getMonth() + 1;
    this.projectToMonth   = now.getMonth() + 1;
    // Pre-select all projectable templates
    const ids = new Set(this.projectableTemplates().map(t => t.id));
    this.projectSelectedIds.set(ids);
    this.showProjectModal.set(true);
  }

  closeProjectModal(): void {
    this.showProjectModal.set(false);
  }

  isProjectSelected(id: string): boolean {
    return this.projectSelectedIds().has(id);
  }

  toggleProjectTemplate(id: string): void {
    this.projectSelectedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  get allProjectableSelected(): boolean {
    const ids = this.projectSelectedIds();
    return this.projectableTemplates().length > 0 &&
           this.projectableTemplates().every(t => ids.has(t.id));
  }

  toggleAllProjectTemplates(): void {
    if (this.allProjectableSelected) {
      this.projectSelectedIds.set(new Set());
    } else {
      this.projectSelectedIds.set(new Set(this.projectableTemplates().map(t => t.id)));
    }
  }

  onProjectRangeChange(): void {
    if (this.projectToMonth < this.projectFromMonth) {
      this.projectToMonth = this.projectFromMonth;
    }
    // Re-sync selection to new projectable set
    const projectable = this.projectableTemplates();
    this.projectSelectedIds.update(set => {
      const valid = new Set(projectable.map(t => t.id));
      const next = new Set<string>();
      for (const id of set) if (valid.has(id)) next.add(id);
      // Auto-add newly projectable templates that weren't excluded before
      for (const id of valid) if (!set.size || set.has(id)) next.add(id);
      return next;
    });
  }

  projectPeriod(): void {
    const selectedIds = [...this.projectSelectedIds()];
    if (selectedIds.length === 0) {
      this.toast.error('Selecione ao menos um recorrente para projetar.');
      return;
    }
    this.projecting.set(true);
    const months: number[] = [];
    for (let m = this.projectFromMonth; m <= this.projectToMonth; m++) months.push(m);

    let totalCreated = 0;
    months.reduce((p, m) =>
      p.then(() => this.service.projectPeriod(this.projectYear, m, selectedIds)
        .then(r => { totalCreated += r?.created ?? 0; })),
      Promise.resolve()
    ).then(() => {
      this.projecting.set(false);
      this.closeProjectModal();
      const rangeLabel = this.projectFromMonth === this.projectToMonth
        ? `${this.monthLabel(this.projectFromMonth)}/${this.projectYear}`
        : `${this.monthLabel(this.projectFromMonth)} a ${this.monthLabel(this.projectToMonth)}/${this.projectYear}`;
      this.toast.success(`${totalCreated} lançamentos projetados para ${rangeLabel}!`);
    }).catch((err: unknown) => {
      this.logger.error('Failed to project period', err);
      this.projecting.set(false);
      this.toast.error('Erro ao projetar período.');
    });
  }

  // ── Month toggle (for sporadic) ──────────────────────────────────────────────

  toggleMonth(m: number): void {
    const idx = this.formMonths.indexOf(m);
    if (idx === -1) {
      this.formMonths = [...this.formMonths, m].sort((a, b) => a - b);
    } else {
      this.formMonths = this.formMonths.filter(x => x !== m);
    }
  }

  hasMonth(m: number): boolean {
    return this.formMonths.includes(m);
  }

  monthLabel(m: number): string {
    return MONTH_NAMES[m - 1];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  categoryName(id: string | null): string {
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  accountName(id: string | null): string {
    return this.accounts().find(a => a.id === id)?.name ?? '';
  }

  cardName(id: string | null): string {
    return this.cards().find(c => c.id === id)?.name ?? '';
  }

  frequencyLabel(t: RecurringTemplate): string {
    if (t.frequency === 'monthly') return 'mensal';
    if (!t.months || t.months.length === 0) return 'esporádico';
    return t.months.map(m => MONTH_NAMES[m - 1]).join(', ');
  }

  private resetForm(): void {
    this.formDescription = '';
    this.formAmount = 0;
    this.formType = 'TRANSACTION';
    this.formDayOfMonth = 1;
    this.formCategoryId = '';
    this.formAccountId = '';
    this.formCreditCardId = '';
    this.formIsActive = true;
    this.formFrequency = 'monthly';
    this.formMonths = [];
  }
}
