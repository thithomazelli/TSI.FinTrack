import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
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

  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);

  ngOnInit(): void {
    this.balanceService.getAvailableBalance().subscribe({ next: v => this.available.set(v), error: () => {} });
    this.balanceService.getProjectedBalance().subscribe({ next: v => this.projected.set(v), error: () => {} });
  }
}
