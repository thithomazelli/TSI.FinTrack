import { ChangeDetectionStrategy, Component, OnInit, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
  selector: 'tsi-balance-card',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './balance-card.component.html',
  styleUrls: ['./balance-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceCardComponent implements OnInit {
  private readonly balanceService = inject(BalanceService);

  /** Year for month-balance calculation. When both year+month provided, uses getMonthBalance. */
  readonly year = input<number | null>(null);
  readonly month = input<number | null>(null);
  /** Legacy: when provided without year/month, caps projected to this date. */
  readonly upToDate = input<string | null>(null);

  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.balanceService.version();
      const y = this.year();
      const m = this.month();
      const end = this.upToDate();
      this.balanceService.getAvailableBalance().subscribe({ next: v => this.available.set(v), error: () => {} });
      if (y !== null && m !== null) {
        this.balanceService.getMonthBalance(y, m).subscribe({ next: v => this.projected.set(v), error: () => {} });
      } else if (end) {
        this.balanceService.getProjectedBalanceUpTo(end).subscribe({ next: v => this.projected.set(v), error: () => {} });
      } else {
        this.balanceService.getProjectedBalance().subscribe({ next: v => this.projected.set(v), error: () => {} });
      }
    });
  }

  ngOnInit(): void { /* handled by effect */ }
}
