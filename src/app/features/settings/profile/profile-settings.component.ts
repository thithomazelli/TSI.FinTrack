import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-profile-settings',
  standalone: true,
  templateUrl: './profile-settings.component.html',
  styleUrls: ['./profile-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent {}
