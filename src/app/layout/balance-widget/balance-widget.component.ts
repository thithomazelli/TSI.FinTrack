import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BalanceService, BalanceSummary } from '../../core/services/balance.service';
import { LanguageService } from '../../core/services/language.service';

@Component({
  selector: 'tsi-balance-widget',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './balance-widget.component.html',
  styleUrls: ['./balance-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceWidgetComponent implements OnInit {
  private readonly balanceService = inject(BalanceService);
  private readonly lang = inject(LanguageService);

  readonly summary   = signal<BalanceSummary | null>(null);
  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);
  readonly hidden    = signal(false);
  readonly loading   = signal(true);

  readonly now   = new Date();
  readonly year  = this.now.getFullYear();
  readonly month = this.now.getMonth() + 1;

  readonly monthLabel = computed(() => {
    const locale = this.lang.current() === 'pt-BR' ? 'pt-BR' : 'en-US';
    const date = new Date(this.year, this.month - 1, 1);
    const mon = date.toLocaleString(locale, { month: 'short' });
    const capitalized = mon.charAt(0).toUpperCase() + mon.slice(1).replace('.', '');
    return `${capitalized}/${this.year}`;
  });

  constructor() {
    effect((onCleanup) => {
      this.balanceService.version();
      // Regra C: sidebar não tem navegação de mês → saldo do mês corrente (todos os status)
      const subs: Subscription[] = [
        this.balanceService.getSummary(this.year, this.month).subscribe({
          next: s => { this.summary.set(s); this.loading.set(false); },
          error: () => this.loading.set(false),
        }),
        this.balanceService.getMonthBalance(this.year, this.month).subscribe({
          next: v => { this.available.set(v); this.projected.set(v); },
          error: () => {},
        }),
      ];
      onCleanup(() => subs.forEach(s => s.unsubscribe()));
    });
  }

  ngOnInit(): void { /* handled by effect */ }

  readonly collapsed = signal(false);
  toggle(): void { this.hidden.update(v => !v); }
  toggleCollapse(): void { this.collapsed.update(v => !v); }
}
