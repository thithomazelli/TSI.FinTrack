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

  /** When provided, projected balance is capped to this ISO date (YYYY-MM-DD). */
  readonly upToDate = input<string | null>(null);

  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);

  constructor() {
    effect(() => {
      const end = this.upToDate();
      if (end) {
        this.balanceService.getProjectedBalanceUpTo(end).subscribe({ next: v => this.projected.set(v), error: () => {} });
      } else {
        this.balanceService.getProjectedBalance().subscribe({ next: v => this.projected.set(v), error: () => {} });
      }
    });
  }

  ngOnInit(): void {
    this.balanceService.getAvailableBalance().subscribe({ next: v => this.available.set(v), error: () => {} });
    if (!this.upToDate()) {
      this.balanceService.getProjectedBalance().subscribe({ next: v => this.projected.set(v), error: () => {} });
    }
  }
}
