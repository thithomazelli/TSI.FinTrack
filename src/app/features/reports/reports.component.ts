import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-reports',
  standalone: true,
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {}
