import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-credit-cards',
  standalone: true,
  templateUrl: './credit-cards.component.html',
  styleUrls: ['./credit-cards.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditCardsComponent {}
