import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { AlertService, Alert } from '../../core/services/alert.service';
import { LoggingService } from '../../core/services/logging.service';

@Component({
    selector: 'tsi-notifications',
    imports: [TranslatePipe, MonthPickerComponent],
    templateUrl: './notifications.component.html',
    styleUrls: ['./notifications.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsComponent implements OnInit {
  private readonly alertService = inject(AlertService);
  private readonly logger = inject(LoggingService);

  readonly alerts = signal<Alert[]>([]);
  readonly dismissedIds = signal<Set<string>>(new Set());
  readonly loading = signal(false);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly visibleAlerts = computed(() => {
    const dismissed = this.dismissedIds();
    return this.alerts().filter(a => !dismissed.has(a.id));
  });

  ngOnInit(): void {
    this.load();
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.load();
  }

  dismiss(id: string): void {
    this.dismissedIds.update(s => new Set([...s, id]));
  }

  private load(): void {
    this.loading.set(true);
    this.dismissedIds.set(new Set());
    this.alertService.getAlerts(this.year(), this.month()).subscribe({
      next: alerts => { this.alerts.set(alerts); this.loading.set(false); },
      error: err => { this.logger.error('Failed to load alerts', err); this.loading.set(false); },
    });
  }
}
