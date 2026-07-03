import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, OnDestroy, OnInit, SimpleChanges, effect, inject, signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
  selector: 'tsi-balance-card',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe],
  templateUrl: './balance-card.component.html',
  styleUrls: ['./balance-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceCardComponent implements OnInit, OnChanges, OnDestroy {
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];

  @Input() year: number  = new Date().getFullYear();
  @Input() month: number = new Date().getMonth() + 1;

  readonly available = signal<number | null>(null);
  readonly projected = signal<number | null>(null);

  constructor() {
    // Re-fetch when any transaction/entry is created or updated
    effect(() => { this.balanceService.version(); this.load(); });
  }

  ngOnInit(): void { this.load(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['year'] || changes['month']) { this.load(); }
  }

  ngOnDestroy(): void { this.cancelAll(); }

  private cancelAll(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];
  }

  private load(): void {
    this.cancelAll();
    const y = this.year;
    const m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;

    if (isCurrent) {
      // Regra B: Atual = REALIZED do mês; Projetado = todos os status do mês
      this.subs.push(
        this.balanceService.getAvailableBalance().subscribe({ next: v => { this.available.set(v); this.cdr.markForCheck(); }, error: () => {} }),
        this.balanceService.getMonthBalance(y, m).subscribe({ next: v => { this.projected.set(v); this.cdr.markForCheck(); }, error: () => {} }),
      );
    } else {
      // Regra A (passado) ou C (futuro): saldo do mês sem filtro de status
      this.subs.push(
        this.balanceService.getMonthBalance(y, m).subscribe({
          next: v => { this.available.set(v); this.projected.set(v); this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    }
  }
}
