import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed, effect, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BalanceService, BalanceSummary } from '../../core/services/balance.service';
import { LanguageService } from '../../core/services/language.service';

@Component({
    selector: 'tsi-balance-widget',
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './balance-widget.component.html',
    styleUrls: ['./balance-widget.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BalanceWidgetComponent {
  private readonly balanceService = inject(BalanceService);
  private readonly lang = inject(LanguageService);

  readonly summary   = signal<BalanceSummary | null>(null);
  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);
  readonly hidden    = signal(false);
  readonly loading   = signal(true);
  readonly collapsed = signal(false);

  readonly now   = new Date();
  readonly year  = this.now.getFullYear();
  readonly month = this.now.getMonth() + 1;
  readonly end   = new Date(this.year, this.month, 0).toISOString().split('T')[0];

  readonly monthLabel = computed(() => {
    const locale = this.lang.current() === 'pt-BR' ? 'pt-BR' : 'en-US';
    const date = new Date(this.year, this.month - 1, 1);
    const mon = date.toLocaleString(locale, { month: 'short' });
    const capitalized = mon.charAt(0).toUpperCase() + mon.slice(1).replace('.', '');
    return `${capitalized}/${this.year}`;
  });

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.fetch());
    });
  }

  private async fetch(): Promise<void> {
    const [summary, available, projected] = await Promise.all([
      this.balanceService.getSummary(this.year, this.month),
      this.balanceService.getAvailableBalance(),
      this.balanceService.getBalanceUpTo(this.end),
    ]);
    this.summary.set(summary);
    this.available.set(available);
    this.projected.set(projected);
    this.loading.set(false);
  }

  toggle(): void { this.hidden.update(v => !v); }
  toggleCollapse(): void { this.collapsed.update(v => !v); }
}
