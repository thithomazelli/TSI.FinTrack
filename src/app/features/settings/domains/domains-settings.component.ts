import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-domains-settings',
  standalone: true,
  templateUrl: './domains-settings.component.html',
  styleUrls: ['./domains-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainsSettingsComponent {}
