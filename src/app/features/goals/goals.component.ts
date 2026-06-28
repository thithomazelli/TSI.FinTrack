import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-goals',
  standalone: true,
  templateUrl: './goals.component.html',
  styleUrls: ['./goals.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalsComponent {}
