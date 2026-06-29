import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BalanceService, BalanceSummary } from '../../core/services/balance.service';

@Component({
  selector: 'tsi-balance-widget',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './balance-widget.component.html',
  styleUrls: ['./balance-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceWidgetComponent implements OnInit {
  private readonly balanceService = inject(BalanceService);

  readonly summary = signal<BalanceSummary | null>(null);
  readonly hidden = signal(false);
  readonly loading = signal(true);

  readonly now = new Date();
  readonly year = this.now.getFullYear();
  readonly month = this.now.getMonth() + 1;

  ngOnInit(): void {
    this.balanceService.getSummary(this.year, this.month).subscribe({
      next: s => { this.summary.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  toggle(): void { this.hidden.update(v => !v); }
}
