import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { CurrencyMaskDirective } from '../../../shared/directives/currency-mask.directive';
import { ModalKeyDirective } from '../../../shared/directives/modal-key.directive';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CreditCard } from '../../../core/models/interfaces/credit-card.interface';

@Component({
    selector: 'tsi-credit-cards-settings',
    imports: [TranslatePipe, FormsModule, CurrencyPipe, CurrencyMaskDirective, ModalKeyDirective],
    templateUrl: './credit-cards-settings.component.html',
    styleUrls: ['./credit-cards-settings.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class CreditCardsSettingsComponent implements OnInit {
  private readonly cardService = inject(CreditCardService);
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly cards = signal<CreditCard[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showArchived = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly showForm = signal(false);
  readonly deletingItem = signal<CreditCard | null>(null);

  formName = '';
  formLastFour = '';
  formLimit = 0;
  formClosingDay = 1;
  formDueDay = 1;
  private originalDueDay = 1;

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.cardService.getAll(this.showArchived()).then(data => {
      this.cards.set(data);
      this.loading.set(false);
    }).catch((err: unknown) => {
      this.logger.error('Failed to load credit cards', err);
      this.loading.set(false);
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
    this.originalDueDay = card.dueDay ?? 1;
    this.showForm.set(true);
  }

  readonly saveAttempted = signal(false);
  private readonly _touched = new Set<string>();
  readonly touchedTick = signal(0);
  markTouched(f: string): void { this._touched.add(f); this.touchedTick.update(n => n + 1); }
  fi(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && !v; }
  fv(k: string, v: boolean): boolean { this.touchedTick(); return (this.saveAttempted() || this._touched.has(k)) && v; }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.saveAttempted.set(false);
    this._touched.clear();
  }

  save(): void {
    if (!this.formName.trim()) { this.saveAttempted.set(true); return; }
    this.saving.set(true);
    const newDueDay = this.formDueDay;
    const payload = {
      name: this.formName.trim(),
      lastFourDigits: this.formLastFour,
      creditLimit: this.formLimit,
      closingDay: this.formClosingDay,
      dueDay: newDueDay,
    };
    const id = this.editingId();
    const dueDayChanged = id !== null && newDueDay !== this.originalDueDay;

    const op$ = id
      ? this.cardService.update(id, payload)
      : this.cardService.create(payload);

    op$.then(saved => {
      this.cards.update(list =>
        id ? list.map(c => (c.id === id ? saved : c)) : [...list, saved]
      );
      const after = id && dueDayChanged
        ? this.cascadeUpdateDueDate(id, newDueDay)
        : Promise.resolve();
      return after.then(() => {
        this.toast.success(id ? 'Cartão atualizado com sucesso!' : 'Cartão criado com sucesso!');
        this.saving.set(false);
        this.closeForm();
      });
    }).catch((err: unknown) => {
      this.logger.error('Failed to save credit card', err);
      this.toast.error('Erro ao salvar cartão.');
      this.saving.set(false);
    });
  }

  private async cascadeUpdateDueDate(cardId: string, dueDay: number): Promise<void> {
    const now = new Date();
    await this.supabase.client.rpc('update_card_due_dates', {
      p_card_id:    cardId,
      p_due_day:    dueDay,
      p_from_year:  now.getFullYear(),
      p_from_month: now.getMonth() + 1,
    });
  }

  confirmDelete(card: CreditCard): void {
    this.deletingItem.set(card);
  }

  cancelDelete(): void {
    this.deletingItem.set(null);
  }

  archive(): void {
    const card = this.deletingItem();
    if (!card) return;
    this.saving.set(true);
    this.cardService.archive(card.id).then(() => {
      this.cards.update(list => list.filter(c => c.id !== card.id));
      this.toast.success('Cartão arquivado.');
      this.deletingItem.set(null);
      this.saving.set(false);
    }).catch((err: unknown) => {
      this.logger.error('Failed to archive card', err);
      this.toast.error('Erro ao arquivar cartão.');
      this.saving.set(false);
    });
  }

  restore(card: CreditCard): void {
    this.cardService.restore(card.id).then(() => {
      this.cards.update(list => list.filter(c => c.id !== card.id));
      this.toast.success('Cartão restaurado com sucesso!');
    }).catch((err: unknown) => {
      this.logger.error('Failed to restore card', err);
      this.toast.error('Erro ao restaurar cartão.');
    });
  }

  toggleActive(card: CreditCard): void {
    const newActive = !card.isActive;
    this.cardService.toggleActive(card.id, newActive).then(updated => {
      this.cards.update(list => list.map(c => c.id === updated.id ? updated : c));
      this.toast.success(newActive ? 'Cartão habilitado.' : 'Cartão desabilitado.');
    }).catch((err: unknown) => {
      this.logger.error('Failed to toggle card active state', err);
      this.toast.error('Erro ao atualizar cartão.');
    });
  }

  cardBrandIcon(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('visa')) return '💳';
    if (n.includes('master') || n.includes('mastercard')) return '🔴';
    if (n.includes('amex') || n.includes('american')) return '🔵';
    if (n.includes('elo')) return '⭐';
    if (n.includes('hipercard') || n.includes('hiper')) return '💜';
    return '💳';
  }
}
