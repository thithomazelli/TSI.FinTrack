import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { MonthPickerComponent } from '../month-picker/month-picker.component';
import { BalanceCardComponent } from '../balance-card/balance-card.component';
import { SavingsBalanceCardComponent } from '../savings-balance-card/savings-balance-card.component';

export type PeriodMode = 'month' | 'range';

@Component({
  selector: 'tsi-period-bar',
  imports: [FormsModule, TranslatePipe, MonthPickerComponent, BalanceCardComponent, SavingsBalanceCardComponent],
  templateUrl: './period-bar.component.html',
  styleUrls: ['./period-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodBarComponent {
  @Input() year: number = new Date().getFullYear();
  @Input() month: number = new Date().getMonth() + 1;
  @Input() periodMode: PeriodMode = 'month';
  @Input() dateFrom: string = '';
  @Input() dateTo: string = '';
  @Input() showModeTabs: boolean = true;

  @Input() preloadedBalance: { available: number; projected: number } | null = null;

  @Output() monthChanged = new EventEmitter<{ year: number; month: number }>();
  @Output() periodModeChange = new EventEmitter<PeriodMode>();
  @Output() dateFromChange = new EventEmitter<string>();
  @Output() dateToChange = new EventEmitter<string>();
}
