import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-accounts-settings',
  standalone: true,
  templateUrl: './accounts-settings.component.html',
  styleUrls: ['./accounts-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsSettingsComponent {}
