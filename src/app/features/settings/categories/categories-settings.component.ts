import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-categories-settings',
  standalone: true,
  templateUrl: './categories-settings.component.html',
  styleUrls: ['./categories-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoriesSettingsComponent {}
