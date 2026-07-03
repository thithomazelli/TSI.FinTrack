import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { RecurringTemplateService } from '../../core/services/recurring-template.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { RecurringTemplate } from '../../core/models/interfaces/recurring-template.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';

@Component({
    selector: 'tsi-recurring',
    imports: [DecimalPipe, FormsModule, TranslatePipe],
    templateUrl: './recurring.component.html',
    styleUrls: ['./recurring.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecurringComponent implements OnInit {
  private readonly service = inject(RecurringTemplateService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly templates = signal<RecurringTemplate[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  formDescription = '';
  formAmount = 0;
  formType: 'TRANSACTION' | 'ENTRY' = 'TRANSACTION';
  formDayOfMonth = 1;
  formCategoryId = '';
  formAccountId = '';
  formCreditCardId = '';
  formIsActive = true;

  readonly days = Array.from({ length: 31 }, (_, i) => i + 1);

  ngOnInit(): void {
    this.categoryService.getAll().subscribe({ next: d => this.categories.set(d) });
    this.accountService.getAll().subscribe({ next: d => this.accounts.set(d) });
    this.cardService.getAll().subscribe({ next: d => this.cards.set(d) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.getAll().subscribe({
      next: data => { this.templates.set(data); this.loading.set(false); },
      error: err => { this.logger.error('Failed to load recurring templates', err); this.loading.set(false); },
    });
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formDescription = '';
    this.formAmount = 0;
    this.formType = 'TRANSACTION';
    this.formDayOfMonth = 1;
    this.formCategoryId = this.categories()[0]?.id ?? '';
    this.formAccountId = '';
    this.formCreditCardId = '';
    this.formIsActive = true;
    this.showForm.set(true);
  }

  openEdit(t: RecurringTemplate): void {
    this.editingId.set(t.id);
    this.formDescription = t.description;
    this.formAmount = t.amount;
    this.formType = t.type;
    this.formDayOfMonth = t.dayOfMonth;
    this.formCategoryId = t.categoryId ?? '';
    this.formAccountId = t.accountId ?? '';
    this.formCreditCardId = t.creditCardId ?? '';
    this.formIsActive = t.isActive;
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formDescription.trim() || this.formAmount <= 0) return;
    this.saving.set(true);

    const payload = {
      description: this.formDescription.trim(),
      amount: this.formAmount,
      type: this.formType,
      dayOfMonth: this.formDayOfMonth,
      categoryId: this.formCategoryId || null,
      accountId: this.formCreditCardId ? null : (this.formAccountId || null),
      creditCardId: this.formCreditCardId || null,
      isActive: this.formIsActive,
    };

    const id = this.editingId();
    const op$ = id ? this.service.update(id, payload) : this.service.create(payload);

    op$.subscribe({
      next: saved => {
        if (id) {
          this.templates.update(list => list.map(t => t.id === id ? saved : t));
          this.toast.success('Recorrente atualizado!');
        } else {
          this.templates.update(list => [...list, saved]);
          this.toast.success('Recorrente criado com sucesso!');
        }
        this.saving.set(false);
        this.closeForm();
      },
      error: err => {
        this.logger.error('Failed to save recurring template', err);
        this.saving.set(false);
        this.toast.error('Erro ao salvar recorrente.');
      },
    });
  }

  delete(t: RecurringTemplate): void {
    this.service.delete(t.id).subscribe({
      next: () => {
        this.templates.update(list => list.filter(x => x.id !== t.id));
        this.toast.success('Recorrente excluído.');
      },
      error: err => {
        this.logger.error('Failed to delete recurring template', err);
        this.toast.error('Erro ao excluir recorrente.');
      },
    });
  }

  toggleActive(t: RecurringTemplate): void {
    this.service.update(t.id, { isActive: !t.isActive }).subscribe({
      next: saved => {
        this.templates.update(list => list.map(x => x.id === t.id ? saved : x));
        this.toast.info(saved.isActive ? 'Recorrente ativado.' : 'Recorrente pausado.');
      },
      error: err => this.logger.error('Failed to toggle recurring', err),
    });
  }

  categoryName(id: string | null): string {
    return this.categories().find(c => c.id === id)?.name ?? '—';
  }

  accountName(id: string | null): string {
    return this.accounts().find(a => a.id === id)?.name ?? '';
  }

  cardName(id: string | null): string {
    return this.cards().find(c => c.id === id)?.name ?? '';
  }
}
