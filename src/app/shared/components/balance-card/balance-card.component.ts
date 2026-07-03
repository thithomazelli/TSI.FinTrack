import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, OnDestroy, OnInit, SimpleChanges, inject,
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

  available: number | null = null;
  projected: number | null = null;

  ngOnInit(): void { this.load(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['year'] || changes['month']) { this.load(); }
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  private load(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs = [];

    const y = this.year;
    const m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;

    if (isCurrent) {
      // Regra B: mês atual — Atual = apenas REALIZED; Projetado = todos os status
      this.subs.push(
        this.balanceService.getAvailableBalance().subscribe({
          next: v => { this.available = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
        this.balanceService.getMonthBalance(y, m).subscribe({
          next: v => { this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    } else {
      // Regra A (mês passado) ou C (mês futuro): ambos = todos os status do mês selecionado
      this.subs.push(
        this.balanceService.getMonthBalance(y, m).subscribe({
          next: v => { this.available = v; this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    }
  }
}
