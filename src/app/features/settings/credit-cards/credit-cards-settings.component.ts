import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-credit-cards-settings',
  standalone: true,
  templateUrl: './credit-cards-settings.component.html',
  styleUrls: ['./credit-cards-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditCardsSettingsComponent {}
