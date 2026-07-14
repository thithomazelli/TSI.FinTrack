import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, Input,
  OnChanges, SimpleChanges, effect, inject, untracked,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BalanceService } from '../../../core/services/balance.service';

@Component({
    selector: 'tsi-balance-card',
    imports: [DecimalPipe, TranslatePipe],
    templateUrl: './balance-card.component.html',
    styleUrls: ['./balance-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BalanceCardComponent implements OnChanges {
  private readonly balanceService = inject(BalanceService);
  private readonly cdr = inject(ChangeDetectorRef);

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

  private async fetch(): Promise<void> {
    if (this.preloaded !== null) return;
    const y = this.year; const m = this.month;
    const now = new Date();
    const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
    const end = new Date(y, m, 0).toISOString().split('T')[0];
    if (isCurrent) {
      const [available, projected] = await Promise.all([
        this.balanceService.getAvailableBalance(),
        this.balanceService.getBalanceUpTo(end),
      ]);
      this.available = available; this.projected = projected; this.cdr.markForCheck();
    } else {
      const v = await this.balanceService.getBalanceUpTo(end);
      this.available = v; this.projected = v; this.cdr.markForCheck();
    }
  }
}
