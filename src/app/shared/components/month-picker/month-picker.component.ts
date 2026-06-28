import { ChangeDetectionStrategy, Component, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'tsi-month-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './month-picker.component.html',
  styleUrls: ['./month-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonthPickerComponent {
  readonly year = model<number>(new Date().getFullYear());
  readonly month = model<number>(new Date().getMonth() + 1);
  readonly changed = output<{ year: number; month: number }>();

  prev(): void {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 1) { m = 12; y--; }
    this.year.set(y);
    this.month.set(m);
    this.changed.emit({ year: y, month: m });
  }

  next(): void {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 12) { m = 1; y++; }
    this.year.set(y);
    this.month.set(m);
    this.changed.emit({ year: y, month: m });
  }

  get label(): string {
    return new Date(this.year(), this.month() - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
}
