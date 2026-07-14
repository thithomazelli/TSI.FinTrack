import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, SimpleChanges, effect, inject, untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { SavingsService } from '../../../core/services/savings.service';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
  selector: 'tsi-savings-balance-card',
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './savings-balance-card.component.html',
  styleUrls: ['./savings-balance-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsBalanceCardComponent implements OnChanges {
  private readonly savingsService = inject(SavingsService);
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);

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

  private async fetch(): Promise<void> {
    const y = this.year, m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
    // Last day of selected month
    const endSelected = new Date(y, m, 0).toISOString().split('T')[0];

    if (isCurrent) {
      // Atual = saldo até hoje; Projetado = saldo até fim do mês
      const today = now.toISOString().split('T')[0];
      const [available, projected] = await Promise.all([
        this.savingsService.getBalanceUpTo(today),
        this.savingsService.getBalanceUpTo(endSelected),
      ]);
      this.available = available; this.projected = projected; this.cdr.markForCheck();
    } else {
      // Mês passado ou futuro: ambos = saldo acumulado até fim do mês selecionado
      const v = await this.savingsService.getBalanceUpTo(endSelected);
      this.available = v; this.projected = v; this.cdr.markForCheck();
    }
  }
}
