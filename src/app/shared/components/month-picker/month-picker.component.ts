import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../../../core/services/language.service';

@Component({
    selector: 'tsi-month-picker',
    imports: [FormsModule],
    templateUrl: './month-picker.component.html',
    styleUrls: ['./month-picker.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MonthPickerComponent {
  private readonly language = inject(LanguageService);

  readonly year = model<number>(new Date().getFullYear());
  readonly month = model<number>(new Date().getMonth() + 1);
  readonly monthChanged = output<{ year: number; month: number }>();

  // Estado do popup de calendário
  readonly open = signal(false);
  readonly panelYear = signal<number>(new Date().getFullYear());

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);

  prev(): void {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 1) { m = 12; y--; }
    this.apply(y, m);
  }

  next(): void {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 12) { m = 1; y++; }
    this.apply(y, m);
  }

  togglePanel(): void {
    this.panelYear.set(this.year());
    this.open.update(v => !v);
  }

  closePanel(): void {
    this.open.set(false);
  }

  panelPrevYear(): void {
    this.panelYear.update(y => y - 1);
  }

  panelNextYear(): void {
    this.panelYear.update(y => y + 1);
  }

  selectMonth(m: number): void {
    this.apply(this.panelYear(), m);
    this.open.set(false);
  }

  isSelected(m: number): boolean {
    return this.panelYear() === this.year() && m === this.month();
  }

  monthShort(m: number): string {
    return new Date(2020, m - 1, 1)
      .toLocaleDateString(this.language.current(), { month: 'short' })
      .replace('.', '')
      .replace(/^\w/, c => c.toUpperCase());
  }

  get label(): string {
    const raw = new Date(this.year(), this.month() - 1, 1)
      .toLocaleDateString(this.language.current(), { month: 'long', year: 'numeric' });
    // Normalize: browsers/iOS may title-case — ensure only first letter is uppercase
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  private apply(y: number, m: number): void {
    this.year.set(y);
    this.month.set(m);
    this.monthChanged.emit({ year: y, month: m });
  }
}
