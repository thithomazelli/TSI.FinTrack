import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, OnDestroy, OnInit, SimpleChanges, inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { switchMap, Subscription } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
    selector: 'tsi-balance-card',
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './balance-card.component.html',
    styleUrls: ['./balance-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BalanceCardComponent implements OnInit, OnChanges, OnDestroy {
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);
  private subs: Subscription[] = [];
  private readonly version$ = toObservable(this.balanceService.version);

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

    const end = new Date(y, m, 0).toISOString().split('T')[0];

    if (isCurrent) {
      // Regra B: mês atual — Atual = só REALIZED; Projetado = todos os status até fim do mês
      this.subs.push(
        this.version$.pipe(switchMap(() => this.balanceService.getAvailableBalance())).subscribe({
          next: v => { this.available = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
        this.version$.pipe(switchMap(() => this.balanceService.getBalanceUpTo(end))).subscribe({
          next: v => { this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    } else {
      // Regra A (mês passado) ou C (mês futuro): ambos = cumulativo até o fim do mês selecionado
      this.subs.push(
        this.version$.pipe(switchMap(() => this.balanceService.getBalanceUpTo(end))).subscribe({
          next: v => { this.available = v; this.projected = v; this.cdr.markForCheck(); },
          error: () => {},
        }),
      );
    }
  }
}
