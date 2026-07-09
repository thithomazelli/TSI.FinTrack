import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, OnDestroy, SimpleChanges, effect, inject, untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
    selector: 'tsi-balance-card',
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './balance-card.component.html',
    styleUrls: ['./balance-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BalanceCardComponent implements OnChanges, OnDestroy {
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  @Input() year: number  = new Date().getFullYear();
  @Input() month: number = new Date().getMonth() + 1;
  /** Se fornecido pelo pai, usa esses valores e não faz queries próprias. */
  @Input() preloaded: { available: number; projected: number } | null = null;

  available: number | null = null;
  projected: number | null = null;

  constructor() {
    effect(() => {
      this.balanceService.version();
      untracked(() => this.fetch());
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preloaded'] && this.preloaded !== null) {
      this.available = this.preloaded.available;
      this.projected = this.preloaded.projected;
      this.cdr.markForCheck();
      return;
    }
    if (changes['year'] || changes['month']) { this.fetch(); }
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  private fetch(): void {
    if (this.preloaded !== null) return; // pai controla os valores
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];

    const y = this.year;
    const m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
    const end = new Date(y, m, 0).toISOString().split('T')[0];

    if (isCurrent) {
      // Regra B: mês atual — Atual = só REALIZED; Projetado = todos os status até fim do mês
      this.subs.push(
        this.balanceService.getAvailableBalance().subscribe({
          next: v => { this.available = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
        this.balanceService.getBalanceUpTo(end).subscribe({
          next: v => { this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    } else {
      // Regra A (mês passado) ou C (mês futuro): ambos = cumulativo até o fim do mês selecionado
      this.subs.push(
        this.balanceService.getBalanceUpTo(end).subscribe({
          next: v => { this.available = v; this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    }
  }
}
