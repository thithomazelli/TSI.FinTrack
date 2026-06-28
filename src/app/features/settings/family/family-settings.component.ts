import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-family-settings',
  standalone: true,
  templateUrl: './family-settings.component.html',
  styleUrls: ['./family-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilySettingsComponent {}
