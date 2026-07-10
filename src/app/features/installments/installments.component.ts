import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService } from '../../core/services/transaction.service';
import { LoggingService } from '../../core/services/logging.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';

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
}

@Component({
  selector: 'tsi-installments',
  imports: [DecimalPipe, TranslatePipe, MonthPickerComponent],
  templateUrl: './installments.component.html',
  styleUrls: ['./installments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallmentsComponent implements OnInit {
  private readonly txService = inject(TransactionService);
  private readonly logger = inject(LoggingService);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly loading = signal(false);
  readonly allInstallments = signal<Transaction[]>([]);

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

      // Paid = installments before the selected month
      const paid = sorted.filter(t => d(t.date) < start).length;
      const pending = totalInstallments - paid;
      const monthlyValue = thisMonthTxs.reduce((s, t) => s + Number(t.amount), 0);
      const totalToPayOff = sorted.filter(t => d(t.date) >= start).reduce((s, t) => s + Number(t.amount), 0);

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

  readonly countPending = computed(() =>
    this.installmentGroups().filter(g => g.pending > 0).length
  );

  ngOnInit(): void {
    this.load();
  }

  onMonthChanged(event: { year: number; month: number }): void {
    this.year.set(event.year);
    this.month.set(event.month);
  }

  private load(): void {
    this.loading.set(true);
    this.txService.getAllInstallments().subscribe({
      next: (txs) => {
        this.allInstallments.set(txs);
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load installments', err);
        this.loading.set(false);
      },
    });
  }
}
