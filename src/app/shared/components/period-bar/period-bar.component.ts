import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { MonthPickerComponent } from '../month-picker/month-picker.component';

export type PeriodMode = 'month' | 'range';

@Component({
  selector: 'tsi-period-bar',
  imports: [FormsModule, TranslatePipe, MonthPickerComponent],
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

  @Output() monthChanged = new EventEmitter<{ year: number; month: number }>();
  @Output() periodModeChange = new EventEmitter<PeriodMode>();
  @Output() dateFromChange = new EventEmitter<string>();
  @Output() dateToChange = new EventEmitter<string>();
}
