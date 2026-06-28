import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-transactions',
  standalone: true,
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {}
