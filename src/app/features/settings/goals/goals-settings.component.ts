import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-goals-settings',
  standalone: true,
  templateUrl: './goals-settings.component.html',
  styleUrls: ['./goals-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalsSettingsComponent {}
