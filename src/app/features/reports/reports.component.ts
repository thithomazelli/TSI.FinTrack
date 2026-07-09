import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { LanguageService } from '../../core/services/language.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { Chart, registerables } from 'chart.js';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { TransactionService } from '../../core/services/transaction.service';
import { EntryService } from '../../core/services/entry.service';
import { CategoryService } from '../../core/services/category.service';
import { SavingsService } from '../../core/services/savings.service';
import { BalanceService } from '../../core/services/balance.service';
import { LoggingService } from '../../core/services/logging.service';
import { ThemeService } from '../../core/services/theme.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Entry } from '../../core/models/interfaces/entry.interface';
import { SavingsMovement } from '../../core/models/interfaces/savings-movement.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';

Chart.register(...registerables);

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

interface MonthlyPoint {
  label: string;
  income: number;
  expense: number;
  balance: number;
}

interface CategorySpend {
  name: string;
  color: string;
  amount: number;
  categoryId: string;
  monthlyAvg: number;
}

interface YearMonthRow {
  month: number;
  label: string;
  income: number;
  expense: number;
  monthlyBalance: number;
  runningBalance: number;
  pct: number;
}


@Component({
    selector: 'tsi-reports',
    imports: [FormsModule, BaseChartDirective, TranslatePipe],
    templateUrl: './reports.component.html',
    styleUrls: ['./reports.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly entryService = inject(EntryService);
  private readonly categoryService = inject(CategoryService);
  private readonly savingsService = inject(SavingsService);
  private readonly balanceService = inject(BalanceService);
  private readonly router = inject(Router);
  private readonly logger = inject(LoggingService);
  readonly themeService = inject(ThemeService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  /** Abreviação do mês (1-12) no idioma atual. */
  monthAbbr(month: number): string {
    const d = new Date(2020, month - 1, 1);
    return d.toLocaleDateString(this.language.current(), { month: 'short' })
      .replace('.', '')
      .replace(/^\w/, c => c.toUpperCase());
  }

  readonly loading = signal(true);
  readonly loadingCatEvol = signal(false);

  readonly now = new Date();
  readonly currentYear = this.now.getFullYear();
  readonly currentMonth = this.now.getMonth() + 1;
  readonly availableYears = Array.from({ length: this.currentYear - 2009 + 1 }, (_, i) => this.currentYear - i);

  readonly activeTab = signal<'charts' | 'history' | 'categories'>('charts');

  readonly filterYear = signal(this.currentYear);
  readonly filterMonth = signal(this.currentMonth);
  readonly filterCategoryId = signal('');
  readonly incomeTarget = signal(80);

  readonly categories = signal<Category[]>([]);
  readonly yearSummaryRows = signal<YearMonthRow[]>([]);
  readonly loadingHistory = signal(false);
  readonly monthlyPoints = signal<MonthlyPoint[]>([]);
  readonly prevMonthlyPoints = signal<MonthlyPoint[]>([]);
  readonly categorySpend = signal<CategorySpend[]>([]);
  readonly monthCategorySpend = signal<CategorySpend[]>([]);
  readonly savingsMovements = signal<SavingsMovement[]>([]);
  readonly paymentTypeSpend = signal<{ label: string; amount: number; color: string }[]>([]);
  readonly catEvolPoints = signal<{ label: string; amount: number }[]>([]);
  readonly realizedTransactions = signal<Transaction[]>([]);
  readonly yearEntries = signal<Entry[]>([]);

  private gridColor(): string {
    return this.themeService.isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  }

  private textColor(): string {
    return this.themeService.isDark() ? '#9098b1' : '#5a607a';
  }

  private baseOptions(stacked = false): object {
    const gridColor = this.gridColor();
    const textColor = this.textColor();
    return {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: { color: textColor, font: { size: 12 } },
        },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: {
          stacked,
          grid: { color: gridColor },
          ticks: { color: textColor },
        },
        y: {
          stacked,
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor },
        },
      },
    };
  }

  readonly evolutionChartData = computed<ChartData<'line'>>(() => ({
    labels: this.monthlyPoints().map((p) => p.label),
    datasets: [
      {
        label: 'Entradas',
        data: this.monthlyPoints().map((p) => p.income),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
      },
      {
        label: 'Gastos',
        data: this.monthlyPoints().map((p) => p.expense),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 4,
      },
      {
        label: 'Saldo',
        data: this.monthlyPoints().map((p) => p.balance),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.05)',
        fill: false,
        tension: 0.35,
        pointRadius: 4,
        borderDash: [4, 4],
      },
    ],
  }));

  readonly incomeRatioChartData = computed<ChartData<'bar'>>(() => {
    const points = this.monthlyPoints();
    const target = this.incomeTarget();
    const ratios = points.map((p) => (p.income > 0 ? Math.round((p.expense / p.income) * 100) : 0));
    return {
      labels: points.map((p) => p.label),
      datasets: [
        {
          type: 'bar' as const,
          label: '% renda gasta',
          data: ratios,
          backgroundColor: ratios.map((r) => (r > target ? 'rgba(239,68,68,0.75)' : 'rgba(99,102,241,0.65)')),
          borderRadius: 4,
          order: 2,
        },
        {
          type: 'line' as const,
          label: `Meta (${target}%)`,
          data: Array(12).fill(target),
          borderColor: '#f59e0b',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 1,
        } as never,
      ],
    };
  });

  readonly categoryPieData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.monthCategorySpend().map((c) => c.name),
    datasets: [
      {
        data: this.monthCategorySpend().map((c) => c.amount),
        backgroundColor: this.monthCategorySpend().map((c) => c.color),
        borderWidth: 2,
        borderColor: this.themeService.isDark() ? '#1a1d27' : '#ffffff',
      },
    ],
  }));

  readonly rankingBarData = computed<ChartData<'bar'>>(() => {
    const top = this.categorySpend().slice(0, 10);
    return {
      labels: top.map((c) => c.name),
      datasets: [
        {
          label: 'Total no ano',
          data: top.map((c) => c.amount),
          backgroundColor: top.map((c) => c.color),
          borderRadius: 4,
        },
      ],
    };
  });

  readonly avgMonthlyBarData = computed<ChartData<'bar'>>(() => {
    const top = this.categorySpend()
      .filter((c) => c.monthlyAvg > 0)
      .slice(0, 10);
    return {
      labels: top.map((c) => c.name),
      datasets: [
        {
          label: 'Média mensal',
          data: top.map((c) => c.monthlyAvg),
          backgroundColor: top.map((c) => c.color + 'cc'),
          borderRadius: 4,
        },
      ],
    };
  });

  readonly yoyChartData = computed<ChartData<'bar'>>(() => {
    const year = this.filterYear();
    const curr = this.categorySpend().slice(0, 8);
    const prev = this.prevMonthlyPoints();
    const prevCatMap: Record<string, number> = {};
    return {
      labels: curr.map((c) => c.name),
      datasets: [
        {
          label: String(year - 1),
          data: curr.map((c) => prevCatMap[c.categoryId] ?? 0),
          backgroundColor: 'rgba(148,163,184,0.65)',
          borderRadius: 4,
        },
        {
          label: String(year),
          data: curr.map((c) => c.amount),
          backgroundColor: curr.map((c) => c.color + 'cc'),
          borderRadius: 4,
        },
      ],
    };
  });

  readonly catEvolChartData = computed<ChartData<'line'>>(() => {
    const cat = this.categories().find((c) => c.id === this.filterCategoryId());
    return {
      labels: this.catEvolPoints().map((p) => p.label),
      datasets: [
        {
          label: cat?.name ?? 'Categoria',
          data: this.catEvolPoints().map((p) => p.amount),
          borderColor: cat?.color ?? '#6366f1',
          backgroundColor: (cat?.color ?? '#6366f1') + '22',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
        },
      ],
    };
  });

  readonly paymentTypeChartData = computed<ChartData<'doughnut'>>(() => ({
    labels: this.paymentTypeSpend().map((p) => p.label),
    datasets: [
      {
        data: this.paymentTypeSpend().map((p) => p.amount),
        backgroundColor: this.paymentTypeSpend().map((p) => p.color),
        borderWidth: 2,
        borderColor: this.themeService.isDark() ? '#1a1d27' : '#ffffff',
      },
    ],
  }));

  readonly savingsChartData = computed<ChartData<'line'>>(() => {
    const movements = [...this.savingsMovements()].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    let balance = 0;
    const points = movements.map((m) => {
      balance += m.amount;
      return { label: m.date.slice(0, 7), balance };
    });
    return {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: 'Saldo poupança',
          data: points.map((p) => p.balance),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    };
  });

  readonly cashFlowChartData = computed<ChartData<'line'>>(() => {
    const points = this.monthlyPoints();
    let cumulative = 0;
    const balances = points.map((p) => {
      cumulative += p.balance;
      return cumulative;
    });
    return {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: 'Saldo acumulado',
          data: balances,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
        },
      ],
    };
  });

  readonly lineOptions = computed<ChartConfiguration<'line'>['options']>(() => ({
    ...(this.baseOptions() as object),
    responsive: true,
  } as ChartConfiguration<'line'>['options']));

  readonly barOptions = computed<ChartConfiguration<'bar'>['options']>(() => ({
    ...(this.baseOptions() as object),
    responsive: true,
  } as ChartConfiguration<'bar'>['options']));

  readonly hBarOptions = computed<ChartConfiguration<'bar'>['options']>(() => ({
    ...(this.baseOptions() as object),
    indexAxis: 'y' as const,
    plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
  } as ChartConfiguration<'bar'>['options']));

  readonly doughnutOptions = computed<ChartConfiguration<'doughnut'>['options']>(() => ({
    responsive: true,
    cutout: '60%',
    plugins: {
      legend: {
        position: 'right',
        labels: { color: this.textColor(), font: { size: 11 }, padding: 12, boxWidth: 12 },
      },
    },
  } as ChartConfiguration<'doughnut'>['options']));

  readonly incomeRatioOptions = computed<ChartConfiguration<'bar'>['options']>(() => ({
    ...(this.baseOptions() as object),
    scales: {
      x: { grid: { color: this.gridColor() }, ticks: { color: this.textColor() } },
      y: {
        beginAtZero: true,
        max: 120,
        grid: { color: this.gridColor() },
        ticks: { color: this.textColor(), callback: (v: number | string) => `${v}%` },
      },
    },
    plugins: {
      legend: { labels: { color: this.textColor() } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y}%`,
        },
      },
    },
  } as ChartConfiguration<'bar'>['options']));

  readonly yoyOptions = computed<ChartConfiguration<'bar'>['options']>(() => ({
    ...(this.baseOptions() as object),
    indexAxis: 'y' as const,
    plugins: {
      legend: { labels: { color: this.textColor() } },
      tooltip: { mode: 'index', intersect: false },
    },
  } as ChartConfiguration<'bar'>['options']));

  ngOnInit(): void {
    this.loadAll();
  }

  onYearChange(): void {
    if (this.activeTab() === 'history') {
      this.loadYearSummary();
    } else {
      this.loadAll();
    }
  }

  onMonthChange(): void {
    this.buildMonthCharts();
  }

  onCategoryChange(): void {
    if (!this.filterCategoryId()) return;
    this.loadCategoryEvolution();
  }

  onTabChange(tab: 'charts' | 'history' | 'categories'): void {
    this.activeTab.set(tab);
    if (tab === 'history') this.loadYearSummary();
    if (tab === 'categories' && this.realizedTransactions().length === 0) this.loadAll();
  }

  loadYearSummary(): void {
    const year = this.filterYear();
    this.loadingHistory.set(true);

    const prevYearEnd = `${year - 1}-12-31`;

    forkJoin({
      openingBalance: this.balanceService.getBalanceUpTo(prevYearEnd),
      entries: forkJoin(ALL_MONTHS.map((m) => this.entryService.getByMonth({ year, month: m }))).pipe(map((r) => r.flat())),
      transactions: forkJoin(ALL_MONTHS.map((m) => this.transactionService.getByMonth({ year, month: m, status: TransactionStatus.Realized }))).pipe(map((r) => r.flat())),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ openingBalance, entries, transactions }) => {
          let running = openingBalance;
          const rows: YearMonthRow[] = ALL_MONTHS.map((m, i) => {
            const income = entries.filter((e) => +e.date.substring(5, 7) === m).reduce((s, e) => s + e.amount, 0);
            const expense = transactions.filter((t) => +t.date.substring(5, 7) === m).reduce((s, t) => s + t.amount, 0);
            const monthlyBalance = income - expense;
            running += monthlyBalance;
            return {
              month: m,
              label: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][i],
              income,
              expense,
              monthlyBalance,
              runningBalance: running,
              pct: income > 0 ? (expense / income) * 100 : 0,
            };
          });
          this.yearSummaryRows.set(rows);
          this.loadingHistory.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load year summary', err);
          this.loadingHistory.set(false);
        },
      });
  }

  readonly categoryMonthMatrix = computed(() => {
    const realized = this.realizedTransactions();
    const entries = this.yearEntries();
    const cats = this.categories();

    // Build category rows
    const catMap: Record<string, { name: string; months: number[]; total: number }> = {};
    for (const t of realized) {
      if (!t.categoryId) continue;
      const cat = cats.find((c) => c.id === t.categoryId);
      const name = cat?.name ?? t.categoryId;
      if (!catMap[t.categoryId]) catMap[t.categoryId] = { name, months: Array(12).fill(0), total: 0 };
      const m = +t.date.substring(5, 7) - 1;
      catMap[t.categoryId].months[m] += t.amount;
      catMap[t.categoryId].total += t.amount;
    }

    const rows = Object.values(catMap).sort((a, b) => b.total - a.total);

    // Monthly totals and income
    const monthTotals = Array(12).fill(0);
    for (const row of rows) row.months.forEach((v, i) => (monthTotals[i] += v));
    const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

    // Monthly income
    const monthIncome = Array(12).fill(0);
    for (const e of entries) {
      const m = +e.date.substring(5, 7) - 1;
      monthIncome[m] += e.amount;
    }
    const totalIncome = monthIncome.reduce((s, v) => s + v, 0);

    return { rows, monthTotals, grandTotal, monthIncome, totalIncome };
  });

  readonly yearSummaryTotals = computed(() => {
    const rows = this.yearSummaryRows();
    const income = rows.reduce((s, r) => s + r.income, 0);
    const expense = rows.reduce((s, r) => s + r.expense, 0);
    return { income, expense, balance: income - expense, pct: income > 0 ? (expense / income) * 100 : 0 };
  });

  private loadAll(): void {
    this.loading.set(true);
    const year = this.filterYear();
    const prevYear = year - 1;

    forkJoin({
      realized: forkJoin(
        ALL_MONTHS.map((m) =>
          this.transactionService.getByMonth({ year, month: m, status: TransactionStatus.Realized })
        )
      ).pipe(map((r) => r.flat())),
      projected: forkJoin(
        ALL_MONTHS.map((m) =>
          this.transactionService.getByMonth({ year, month: m, status: TransactionStatus.Projected })
        )
      ).pipe(map((r) => r.flat())),
      entries: forkJoin(
        ALL_MONTHS.map((m) => this.entryService.getByMonth({ year, month: m }))
      ).pipe(map((r) => r.flat())),
      prevRealized: forkJoin(
        ALL_MONTHS.map((m) =>
          this.transactionService.getByMonth({ year: prevYear, month: m, status: TransactionStatus.Realized })
        )
      ).pipe(map((r) => r.flat())),
      prevEntries: forkJoin(
        ALL_MONTHS.map((m) => this.entryService.getByMonth({ year: prevYear, month: m }))
      ).pipe(map((r) => r.flat())),
      savings: this.savingsService.getAll(),
      categories: this.categoryService.getAll(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ realized, projected, entries, prevRealized, prevEntries, savings, categories }) => {
          this.categories.set(categories);
          this.savingsMovements.set(savings);
          this.realizedTransactions.set(realized);
          this.yearEntries.set(entries);
          this.buildCharts(year, realized, projected, entries, prevRealized, prevEntries, categories);
          this.loading.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load reports data', err);
          this.loading.set(false);
        },
      });
  }

  private buildCharts(
    year: number,
    realized: Transaction[],
    projected: Transaction[],
    entries: Entry[],
    prevRealized: Transaction[],
    prevEntries: Entry[],
    categories: Category[]
  ): void {
    const points = ALL_MONTHS.map((m, i) => {
      const income = entries
        .filter((e) => +e.date.substring(5, 7) === m)
        .reduce((s, e) => s + e.amount, 0);
      const expense = realized
        .filter((t) => +t.date.substring(5, 7) === m)
        .reduce((s, t) => s + t.amount, 0);
      return { label: MONTHS_PT[i], income, expense, balance: income - expense };
    });
    this.monthlyPoints.set(points);

    const prevPoints = ALL_MONTHS.map((m, i) => {
      const income = prevEntries
        .filter((e) => +e.date.substring(5, 7) === m)
        .reduce((s, e) => s + e.amount, 0);
      const expense = prevRealized
        .filter((t) => +t.date.substring(5, 7) === m)
        .reduce((s, t) => s + t.amount, 0);
      return { label: MONTHS_PT[i], income, expense, balance: income - expense };
    });
    this.prevMonthlyPoints.set(prevPoints);

    const catMap: Record<string, CategorySpend> = {};
    const monthsWithData = new Set<string>();

    for (const t of realized) {
      if (!t.categoryId) continue;
      const cat = categories.find((c) => c.id === t.categoryId);
      if (!catMap[t.categoryId]) {
        catMap[t.categoryId] = {
          categoryId: t.categoryId,
          name: cat?.name ?? t.categoryId,
          color: cat?.color ?? '#6366f1',
          amount: 0,
          monthlyAvg: 0,
        };
      }
      catMap[t.categoryId].amount += t.amount;
      monthsWithData.add(`${t.categoryId}-${t.date.substring(5, 7)}`);
    }

    const totalMonthsInYear = Math.min(
      year < this.currentYear ? 12 : this.currentMonth,
      12
    );
    for (const key of Object.keys(catMap)) {
      catMap[key].monthlyAvg = catMap[key].amount / totalMonthsInYear;
    }

    this.categorySpend.set(Object.values(catMap).sort((a, b) => b.amount - a.amount));

    this.buildPaymentTypes(realized);
    this.buildMonthCharts();

    if (this.filterCategoryId()) {
      this.loadCategoryEvolution();
    }
  }

  private buildMonthCharts(): void {
    const month = this.filterMonth();
    const year = this.filterYear();
    const cats = this.categories();

    this.transactionService
      .getByMonth({ year, month, status: TransactionStatus.Realized })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transactions) => {
          const monthCatMap: Record<string, CategorySpend> = {};
          for (const t of transactions) {
            if (!t.categoryId) continue;
            const cat = cats.find((c) => c.id === t.categoryId);
            if (!monthCatMap[t.categoryId]) {
              monthCatMap[t.categoryId] = {
                categoryId: t.categoryId,
                name: cat?.name ?? t.categoryId,
                color: cat?.color ?? '#6366f1',
                amount: 0,
                monthlyAvg: 0,
              };
            }
            monthCatMap[t.categoryId].amount += t.amount;
          }
          this.monthCategorySpend.set(
            Object.values(monthCatMap).sort((a, b) => b.amount - a.amount)
          );
        },
        error: (err) => this.logger.error('Failed to load month categories', err),
      });
  }

  private buildPaymentTypes(realized: Transaction[]): void {
    let cardTotal = 0;
    let debitTotal = 0;
    let otherTotal = 0;

    for (const t of realized) {
      if (t.creditCardId) {
        cardTotal += t.amount;
      } else if (t.accountId) {
        debitTotal += t.amount;
      } else {
        otherTotal += t.amount;
      }
    }

    const types = [
      { label: 'Cartão de crédito', amount: cardTotal, color: '#6366f1' },
      { label: 'Conta / Débito', amount: debitTotal, color: '#22c55e' },
      { label: 'Outros', amount: otherTotal, color: '#f59e0b' },
    ].filter((t) => t.amount > 0);

    this.paymentTypeSpend.set(types);
  }

  private loadCategoryEvolution(): void {
    const catId = this.filterCategoryId();
    if (!catId) return;

    this.loadingCatEvol.set(true);
    const monthsBack = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(this.currentYear, this.currentMonth - 1 - i, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }).reverse();

    forkJoin(
      monthsBack.map(({ year, month }) =>
        this.transactionService.getByMonth({ year, month, status: TransactionStatus.Realized, categoryId: catId })
      )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          const points = results.map((txList, i) => {
            const { year, month } = monthsBack[i];
            const amount = txList.reduce((s, t) => s + t.amount, 0);
            return { label: `${MONTHS_PT[month - 1]}/${String(year).slice(2)}`, amount };
          });
          this.catEvolPoints.set(points);
          this.loadingCatEvol.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load category evolution', err);
          this.loadingCatEvol.set(false);
        },
      });
  }

  goToMovimentos(year: number, month: number): void {
    this.router.navigate(['/movimentos'], { queryParams: { year, month } });
  }

  readonly toIncome = (acc: number, p: MonthlyPoint) => acc + p.income;
  readonly toExpense = (acc: number, p: MonthlyPoint) => acc + p.expense;
  readonly toBalance = (acc: number, p: MonthlyPoint) => acc + p.balance;

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
}
