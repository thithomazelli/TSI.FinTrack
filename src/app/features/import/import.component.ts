import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'tsi-import',
  standalone: true,
  templateUrl: './import.component.html',
  styleUrls: ['./import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportComponent {}
