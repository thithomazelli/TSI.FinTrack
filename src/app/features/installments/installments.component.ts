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
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService } from '../../core/services/transaction.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';

type SortCol = 'description' | 'totalInstallments' | 'paid' | 'pending' | 'unitValue' | 'monthlyValue' | 'totalToPayOff' | 'lastInstallmentDate' | 'creditCardName';

interface InstallmentGroup {
  groupId: string;
  description: string;
  totalInstallments: number;
  paid: number;
  pending: number;
  unitValue: number;
  monthlyValue: number;
  totalToPayOff: number;
  hasInstallmentThisMonth: boolean;
  lastInstallmentDate: string;
  creditCardName: string;
}

@Component({
  selector: 'tsi-installments',
  imports: [DecimalPipe, TranslatePipe, MonthPickerComponent, DatePipe, FormsModule],
  templateUrl: './installments.component.html',
  styleUrls: ['./installments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallmentsComponent implements OnInit {
  private readonly txService = inject(TransactionService);
  private readonly ccService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly loading = signal(false);
  readonly allInstallments = signal<Transaction[]>([]);
  readonly creditCards = signal<CreditCard[]>([]);

  readonly endOfMonth = computed(() => {
    const y = this.year(), m = this.month();
    return new Date(y, m, 0).toISOString().split('T')[0];
  });

  readonly startOfMonth = computed(() => {
    const y = this.year(), m = this.month();
    return `${y}-${String(m).padStart(2, '0')}-01`;
  });

  readonly installmentGroups = computed((): InstallmentGroup[] => {
    const end = this.endOfMonth();
    const start = this.startOfMonth();
    const all = this.allInstallments();
    const ccMap = new Map(this.creditCards().map(c => [c.id, c.name]));

    // Group by installmentGroupId when set; otherwise derive key from description pattern
    const instRe = /^(.*?)\s+(\d{1,2})\/(\d{1,2})$/;
    const byGroup = new Map<string, Transaction[]>();
    for (const tx of all) {
      let gid: string;
      if (tx.installmentGroupId) {
        gid = tx.installmentGroupId;
      } else {
        const m = instRe.exec(tx.description?.trim() ?? '');
        if (!m) continue;
        const total = parseInt(m[3], 10);
        gid = `${m[1].trim().toLowerCase()}|${tx.creditCardId ?? ''}|${total}`;
      }
      if (!byGroup.has(gid)) byGroup.set(gid, []);
      byGroup.get(gid)!.push(tx);
    }

    const d = (date: string) => date.slice(0, 10); // normalise 'YYYY-MM-DDThh:mm:ss' → 'YYYY-MM-DD'

    const groups: InstallmentGroup[] = [];
    for (const [groupId, txs] of byGroup) {
      const sorted = [...txs].sort((a, b) => d(a.date).localeCompare(d(b.date)));

      // Only show this group if it has a transaction in the selected month
      const thisMonthTxs = sorted.filter(t => d(t.date) >= start && d(t.date) <= end);
      if (thisMonthTxs.length === 0) continue;

      const totalInstallments = sorted[0].totalInstallments ?? sorted.length;
      const unitValue = Number(thisMonthTxs[0].amount);

      // When the DB has fewer records than the total (e.g. only one installment was imported),
      // derive paid/pending from the installment_number encoded in the record rather than
      // counting actual rows — counting rows gives 0 paid / 1 pending for a "04/07" record.
      const isPartialData = sorted.length < totalInstallments;
      let paid: number;
      let pending: number;
      let totalToPayOff: number;
      let lastInstallmentDate: string;

      if (isPartialData) {
        // Prefer the number encoded in the description ("04/07" → 4) over the
        // DB column, which may be null or incorrect for manually-imported records.
        const firstDesc = sorted[0].description?.trim() ?? '';
        const descNum   = instRe.exec(firstDesc);
        const minInstNum = descNum
          ? parseInt(descNum[2], 10)
          : Math.min(...sorted.map(t => t.installmentNumber ?? 1));
        paid    = minInstNum - 1;
        pending = totalInstallments - paid;
        totalToPayOff    = unitValue * pending;
        // Extrapolate last installment date: add (totalInstallments - minInstNum) months
        const refDate  = new Date(d(sorted[0].date) + 'T12:00:00');
        const lastDate = new Date(refDate);
        lastDate.setMonth(lastDate.getMonth() + (totalInstallments - minInstNum));
        lastInstallmentDate = lastDate.toISOString().slice(0, 10);
      } else {
        paid    = sorted.filter(t => d(t.date) < start).length;
        const remaining = sorted.filter(t => d(t.date) >= start);
        pending = remaining.length;
        totalToPayOff    = remaining.reduce((s, t) => s + Number(t.amount), 0);
        lastInstallmentDate = sorted[sorted.length - 1].date.slice(0, 10);
      }

      if (pending <= 0) continue;
      const monthlyValue = thisMonthTxs.reduce((s, t) => s + Number(t.amount), 0);
      const creditCardId = thisMonthTxs[0].creditCardId ?? sorted[sorted.length - 1].creditCardId;
      const creditCardName = (creditCardId ? ccMap.get(creditCardId) : null) ?? '—';

      groups.push({
        groupId,
        description: sorted[0].description,
        totalInstallments,
        paid,
        pending,
        unitValue,
        monthlyValue,
        totalToPayOff,
        hasInstallmentThisMonth: true,
        lastInstallmentDate,
        creditCardName,
      });
    }

    return groups.sort((a, b) => b.totalToPayOff - a.totalToPayOff);
  });

  readonly monthTotal = computed(() =>
    this.installmentGroups()
      .filter(g => g.hasInstallmentThisMonth)
      .reduce((s, g) => s + g.monthlyValue, 0)
  );

  readonly totalToPayOff = computed(() =>
    this.installmentGroups().reduce((s, g) => s + g.totalToPayOff, 0)
  );

  readonly countThisMonth = computed(() =>
    this.installmentGroups().filter(g => g.hasInstallmentThisMonth).length
  );

  readonly selectedIds = signal<Set<string>>(new Set());

  private syncSelectionToAll(): void {
    this.selectedIds.set(new Set(this.sortedGroups().map(g => g.groupId)));
  }

  readonly selectionTotals = computed(() => {
    const ids = this.selectedIds();
    const sel = this.sortedGroups().filter(g => ids.has(g.groupId));
    return {
      count: sel.length,
      monthlyValue: sel.reduce((s, g) => s + g.monthlyValue, 0),
      totalToPayOff: sel.reduce((s, g) => s + g.totalToPayOff, 0),
    };
  });

  readonly allSelected = computed(() => {
    const groups = this.sortedGroups();
    return groups.length > 0 && groups.every(g => this.selectedIds().has(g.groupId));
  });

  toggleRow(groupId: string): void {
    this.selectedIds.update(set => {
      const next = new Set(set);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.sortedGroups().map(g => g.groupId)));
    }
  }

  readonly sortCol = signal<SortCol>('totalToPayOff');
  readonly sortAsc = signal(false);
  readonly searchQuery = signal('');

  readonly sortedGroups = computed(() => {
    const col = this.sortCol();
    const asc = this.sortAsc();
    const q = this.searchQuery().trim().toLowerCase();
    const base = this.activeTab() === 'ending' ? this.endingGroups() : this.installmentGroups();
    const groups = q
      ? base.filter(g =>
          g.description.toLowerCase().includes(q) ||
          g.creditCardName.toLowerCase().includes(q)
        )
      : base;
    return [...groups].sort((a, b) => {
      const va = a[col], vb = b[col];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? cmp : -cmp;
    });
  });

  sort(col: SortCol): void {
    if (this.sortCol() === col) {
      this.sortAsc.update(v => !v);
    } else {
      this.sortCol.set(col);
      this.sortAsc.set(col === 'description');
    }
  }

  sortIcon(col: SortCol): string {
    if (this.sortCol() !== col) return '↕';
    return this.sortAsc() ? '↑' : '↓';
  }

  readonly countPending = computed(() =>
    this.installmentGroups().filter(g => g.pending > 0).length
  );

  readonly activeTab = signal<'all' | 'ending'>('all');

  readonly endingGroups = computed(() => {
    const start = this.startOfMonth();
    const end = this.endOfMonth();
    return this.installmentGroups().filter(g =>
      g.lastInstallmentDate >= start && g.lastInstallmentDate <= end
    );
  });

  readonly endingCount = computed(() => this.endingGroups().length);
  readonly endingTotal = computed(() =>
    this.endingGroups().reduce((s, g) => s + g.monthlyValue, 0)
  );

  ngOnInit(): void {
    this.ccService.getAll(true).then(cards => this.creditCards.set(cards));
    this.load();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
    this.syncSelectionToAll();
  }

  private load(): void {
    this.loading.set(true);
    this.txService.getAllInstallments()
      .then((txs) => {
        this.allInstallments.set(txs);
        this.loading.set(false);
        this.syncSelectionToAll();
      })
      .catch((err: unknown) => {
        this.logger.error('Failed to load installments', err);
        this.loading.set(false);
      });
  }
}
