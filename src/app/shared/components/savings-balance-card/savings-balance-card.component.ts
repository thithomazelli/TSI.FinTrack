import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component,
  OnDestroy, OnInit, inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SavingsService } from '../../../core/services/savings.service';
import { BalanceService } from '../../../core/services/balance.service';
import { effect, untracked } from '@angular/core';

@Component({
  selector: 'tsi-savings-balance-card',
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './savings-balance-card.component.html',
  styleUrls: ['./savings-balance-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsBalanceCardComponent implements OnDestroy {
  private readonly savingsService = inject(SavingsService);
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  balance: number | null = null;

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.fetch());
    });
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  private fetch(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [
      this.savingsService.getBalance().subscribe({
        next: v => { this.balance = v; this.cdr.markForCheck(); },
        error: () => {},
      }),
    ];
  }
}
