import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { LoggingService } from '../../../core/services/logging.service';
import { CreditCard } from '../../../core/models/interfaces/credit-card.interface';

@Component({
  selector: 'tsi-credit-cards-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './credit-cards-settings.component.html',
  styleUrls: ['./credit-cards-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreditCardsSettingsComponent implements OnInit {
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);

  readonly cards = signal<CreditCard[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);

  formName = '';
  formLastFour = '';
  formLimit = 0;
  formClosingDay = 1;
  formDueDay = 1;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.cardService.getAll(this.showArchived()).subscribe({
      next: data => {
        this.cards.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.logger.error('Failed to load credit cards', err);
        this.loading.set(false);
      },
    });
  }

  toggleArchived(): void {
    this.showArchived.update(v => !v);
    this.load();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formName = '';
    this.formLastFour = '';
    this.formLimit = 0;
    this.formClosingDay = 1;
    this.formDueDay = 1;
    this.showForm.set(true);
  }

  openEdit(card: CreditCard): void {
    this.editingId.set(card.id);
    this.formName = card.name;
    this.formLastFour = card.lastFourDigits ?? '';
    this.formLimit = card.creditLimit ?? 0;
    this.formClosingDay = card.closingDay ?? 1;
    this.formDueDay = card.dueDay ?? 1;
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formName.trim()) return;
    this.saving.set(true);
    const payload = {
      name: this.formName.trim(),
      lastFourDigits: this.formLastFour,
      creditLimit: this.formLimit,
      closingDay: this.formClosingDay,
      dueDay: this.formDueDay,
    };
    const id = this.editingId();

    const op$ = id
      ? this.cardService.update(id, payload)
      : this.cardService.create(payload);

    op$.subscribe({
      next: saved => {
        this.cards.update(list =>
          id ? list.map(c => (c.id === id ? saved : c)) : [...list, saved]
        );
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save credit card', err);
        this.saving.set(false);
      },
    });
  }

  archive(card: CreditCard): void {
    this.cardService.archive(card.id).subscribe({
      next: () => this.load(),
      error: err => this.logger.error('Failed to archive card', err),
    });
  }

  restore(card: CreditCard): void {
    this.cardService.restore(card.id).subscribe({
      next: () => this.load(),
      error: err => this.logger.error('Failed to restore card', err),
    });
  }
}
