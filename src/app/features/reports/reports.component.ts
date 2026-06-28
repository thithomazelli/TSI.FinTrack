import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { Chart, registerables } from 'chart.js';
import { TransactionService } from '../../core/services/transaction.service';
import { EntryService } from '../../core/services/entry.service';
import { CategoryService } from '../../core/services/category.service';
import { LoggingService } from '../../core/services/logging.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';

Chart.register(...registerables);

interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

@Component({
  selector: 'tsi-reports',
  standalone: true,
  imports: [FormsModule, TranslatePipe, BaseChartDirective],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly entryService = inject(EntryService);
  private readonly categoryService = inject(CategoryService);
  private readonly logger = inject(LoggingService);

  readonly loading = signal(false);
  readonly filterYear = signal(new Date().getFullYear());

  readonly categories = signal<Category[]>([]);
  readonly monthlyPoints = signal<MonthlyPoint[]>([]);
  readonly categorySpend = signal<{ name: string; color: string; amount: number }[]>([]);

  readonly currentYear = new Date().getFullYear();
  readonly currentMonth = new Date().getMonth() + 1;

  readonly evolutionChartData = computed<ChartData<'line'>>(() => ({
    labels: this.monthlyPoints().map((p) => p.label),
    datasets: [
      {
        label: 'Entradas',
        data: this.monthlyPoints().map((p) => p.income),
        borderColor: '#4caf50',
        backgroundColor: 'rgba(76,175,80,0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Gastos',
        data: this.monthlyPoints().map((p) => p.expense),
        borderColor: '#f44336',
        backgroundColor: 'rgba(244,67,54,0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Saldo',
        data: this.monthlyPoints().map((p) => p.balance),
        borderColor: '#2196f3',
        backgroundColor: 'rgba(33,150,243,0.05)',
        fill: false,
        tension: 0.3,
      },
    ],
  }));

  readonly evolutionChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true } },
  };

  readonly categoryChartData = computed<ChartData<'pie'>>(() => ({
    labels: this.categorySpend().map((c) => c.name),
    datasets: [
      {
        data: this.categorySpend().map((c) => c.amount),
        backgroundColor: this.categorySpend().map((c) => c.color),
      },
    ],
  }));

  readonly categoryChartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'right' } },
  };

  readonly categoryBarData = computed<ChartData<'bar'>>(() => ({
    labels: this.categorySpend()
      .slice(0, 10)
      .map((c) => c.name),
    datasets: [
      {
        label: 'Gastos',
        data: this.categorySpend()
          .slice(0, 10)
          .map((c) => c.amount),
        backgroundColor: this.categorySpend()
          .slice(0, 10)
          .map((c) => c.color),
      },
    ],
  }));

  readonly categoryBarOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } },
  };

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => this.logger.error('Failed to load categories', err),
    });
    this.loadYearData();
  }

  onYearChange(): void {
    this.loadYearData();
  }

  private loadYearData(): void {
    this.loading.set(true);
    const year = this.filterYear();
    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const allTransactions: Transaction[] = [];
    const allEntries: Entry[] = [];
    let done = 0;
    const total = months.length * 2;

    const checkDone = () => {
      done++;
      if (done === total) {
        this.buildCharts(year, allTransactions, allEntries);
        this.loading.set(false);
      }
    };

    for (const month of months) {
      this.transactionService
        .getByMonth({ year, month, status: TransactionStatus.Realized })
        .subscribe({
          next: (ts) => { allTransactions.push(...ts); checkDone(); },
          error: () => checkDone(),
        });

      this.entryService.getByMonth({ year, month }).subscribe({
        next: (es) => { allEntries.push(...es); checkDone(); },
        error: () => checkDone(),
      });
    }
  }

  private buildCharts(year: number, transactions: Transaction[], entries: Entry[]): void {
    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const points: MonthlyPoint[] = MONTHS.map((label, i) => {
      const m = i + 1;
      const income = entries
        .filter((e) => new Date(e.date).getMonth() + 1 === m)
        .reduce((s, e) => s + e.amount, 0);
      const expense = transactions
        .filter((t) => new Date(t.date).getMonth() + 1 === m)
        .reduce((s, t) => s + t.amount, 0);
      return { label, income, expense, balance: income - expense };
    });
    this.monthlyPoints.set(points);

    const catMap: Record<string, { name: string; color: string; amount: number }> = {};
    for (const t of transactions) {
      if (!t.categoryId) continue;
      const cat = this.categories().find((c) => c.id === t.categoryId);
      if (!catMap[t.categoryId]) {
        catMap[t.categoryId] = {
          name: cat?.name ?? t.categoryId,
          color: cat?.color ?? '#ccc',
          amount: 0,
        };
      }
      catMap[t.categoryId].amount += t.amount;
    }
    this.categorySpend.set(
      Object.values(catMap).sort((a, b) => b.amount - a.amount)
    );
  }
}
