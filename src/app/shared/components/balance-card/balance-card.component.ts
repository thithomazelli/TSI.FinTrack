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

  readonly year  = input<number>(new Date().getFullYear());
  readonly month = input<number>(new Date().getMonth() + 1);

  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.balanceService.version();
      const y = this.year();
      const m = this.month();
      const now = new Date();
      const curYear  = now.getFullYear();
      const curMonth = now.getMonth() + 1;
      const end = new Date(y, m, 0).toISOString().split('T')[0];
      const isCurrent = y === curYear && m === curMonth;

      if (isCurrent) {
        // Regra B: Atual = apenas REALIZED; Projetado = todos os registros até fim do mês
        this.balanceService.getAvailableBalance().subscribe({ next: v => this.available.set(v), error: () => {} });
        this.balanceService.getBalanceUpTo(end).subscribe({ next: v => this.projected.set(v), error: () => {} });
      } else {
        // Regra A (passado) ou C (futuro): ambos = todos os registros acumulados até fim do mês
        this.balanceService.getBalanceUpTo(end).subscribe({ next: v => { this.available.set(v); this.projected.set(v); }, error: () => {} });
      }
    });
  }

  ngOnInit(): void { /* handled by effect */ }
}
