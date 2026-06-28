import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-savings',
  standalone: true,
  templateUrl: './savings.component.html',
  styleUrls: ['./savings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsComponent {}
