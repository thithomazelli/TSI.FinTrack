import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, OnDestroy, SimpleChanges, effect, inject, untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SavingsService } from '../../../core/services/savings.service';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
  selector: 'tsi-savings-balance-card',
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './savings-balance-card.component.html',
  styleUrls: ['./savings-balance-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsBalanceCardComponent implements OnChanges, OnDestroy {
  private readonly savingsService = inject(SavingsService);
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  @Input() year: number  = new Date().getFullYear();
  @Input() month: number = new Date().getMonth() + 1;

  available: number | null = null;
  projected: number | null = null;

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.fetch());
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['year'] || changes['month']) this.fetch();
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  private fetch(): void {
    this.subs.forEach(s => s.unsubscribe());
    const y = this.year, m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
    // Last day of selected month
    const endSelected = new Date(y, m, 0).toISOString().split('T')[0];
    // Last day of current month
    const endCurrent  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    if (isCurrent) {
      // Atual = saldo até hoje; Projetado = saldo até fim do mês
      const today = now.toISOString().split('T')[0];
      this.subs = [
        this.savingsService.getBalanceUpTo(today).subscribe({
          next: v => { this.available = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
        this.savingsService.getBalanceUpTo(endSelected).subscribe({
          next: v => { this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      ];
    } else {
      // Mês passado ou futuro: ambos = saldo acumulado até fim do mês selecionado
      this.subs = [
        this.savingsService.getBalanceUpTo(endSelected).subscribe({
          next: v => { this.available = v; this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      ];
    }
  }
}
