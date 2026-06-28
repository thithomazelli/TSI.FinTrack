import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-entries',
  standalone: true,
  templateUrl: './entries.component.html',
  styleUrls: ['./entries.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesComponent {}
