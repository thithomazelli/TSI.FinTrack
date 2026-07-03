import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription, switchMap } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { BalanceService, BalanceSummary } from '../../core/services/balance.service';
import { LanguageService } from '../../core/services/language.service';

@Component({
    selector: 'tsi-balance-widget',
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './balance-widget.component.html',
    styleUrls: ['./balance-widget.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BalanceWidgetComponent implements OnInit, OnDestroy {
  private readonly balanceService = inject(BalanceService);
  private readonly lang = inject(LanguageService);
  private readonly subs: Subscription[] = [];

  readonly summary   = signal<BalanceSummary | null>(null);
  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);
  readonly hidden    = signal(false);
  readonly loading   = signal(true);
  readonly collapsed = signal(false);

  readonly now   = new Date();
  readonly year  = this.now.getFullYear();
  readonly month = this.now.getMonth() + 1;
  private readonly version$ = toObservable(this.balanceService.version);

  readonly monthLabel = computed(() => {
    const locale = this.lang.current() === 'pt-BR' ? 'pt-BR' : 'en-US';
    const date = new Date(this.year, this.month - 1, 1);
    const mon = date.toLocaleString(locale, { month: 'short' });
    const capitalized = mon.charAt(0).toUpperCase() + mon.slice(1).replace('.', '');
    return `${capitalized}/${this.year}`;
  });

  ngOnInit(): void {
    this.subs.push(
      // Regra B — resumo do mês (só REALIZED)
      this.version$.pipe(
        switchMap(() => this.balanceService.getSummary(this.year, this.month))
      ).subscribe({ next: s => { this.summary.set(s); this.loading.set(false); }, error: () => this.loading.set(false) }),
      // Regra B — ATUAL = saldo realizado acumulado (v_available_balance)
      this.version$.pipe(
        switchMap(() => this.balanceService.getAvailableBalance())
      ).subscribe({ next: v => this.available.set(v), error: () => {} }),
      // Regra B — PROJETADO = saldo projetado acumulado (v_projected_balance)
      this.version$.pipe(
        switchMap(() => this.balanceService.getProjectedBalance())
      ).subscribe({ next: v => this.projected.set(v), error: () => {} }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  toggle(): void { this.hidden.update(v => !v); }
  toggleCollapse(): void { this.collapsed.update(v => !v); }
}
