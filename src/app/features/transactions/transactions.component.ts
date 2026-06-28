import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService, CreateTransactionPayload } from '../../core/services/transaction.service';
import { CategoryService } from '../../core/services/category.service';
import { AccountService } from '../../core/services/account.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { LoggingService } from '../../core/services/logging.service';
import { ToastService } from '../../shared/services/toast.service';
import { Transaction } from '../../core/models/interfaces/transaction.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { MonthPickerComponent } from '../../shared/components/month-picker/month-picker.component';
import { LabelsInputComponent } from '../../shared/components/labels-input/labels-input.component';

@Component({
  selector: 'tsi-transactions',
  standalone: true,
  imports: [DecimalPipe, FormsModule, TranslatePipe, MonthPickerComponent, LabelsInputComponent],
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly categoryService = inject(CategoryService);
  private readonly accountService = inject(AccountService);
  private readonly cardService = inject(CreditCardService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly TransactionStatus = TransactionStatus;

  readonly transactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly editingId = signal<string | null>(null);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);

  readonly totalRealized = computed(() =>
    this.transactions()
      .filter(t => t.status === TransactionStatus.Realized)
      .reduce((s, t) => s + t.amount, 0)
  );

  readonly totalProjected = computed(() =>
    this.transactions()
      .filter(t => t.status === TransactionStatus.Projected)
      .reduce((s, t) => s + t.amount, 0)
  );

  formDescription = '';
  formAmount = 0;
  formDate = new Date().toISOString().split('T')[0];
  formCategoryId = '';
  formAccountId = '';
  formCreditCardId = '';
  formStatus: TransactionStatus = TransactionStatus.Realized;
  formInstallments = 1;
  formIsInstallment = false;
  formIsInternational = false;
  formOriginalCurrency = 'USD';
  formOriginalAmount = 0;
  formExchangeRate = 0;
  formLabels: string[] = [];

  ngOnInit(): void {
    this.loadRefs();
    this.load();
  }

  private loadRefs(): void {
    this.categoryService.getAll().subscribe({ next: d => this.categories.set(d) });
    this.accountService.getAll().subscribe({ next: d => this.accounts.set(d) });
    this.cardService.getAll().subscribe({ next: d => this.cards.set(d) });
  }

  load(): void {
    this.loading.set(true);
    this.transactionService
      .getByMonth({ year: this.year(), month: this.month() })
      .subscribe({
        next: data => {
          this.transactions.set(data);
          this.loading.set(false);
        },
        error: err => {
          this.logger.error('Failed to load transactions', err);
          this.loading.set(false);
          this.toast.error('Erro ao carregar transações.');
        },
      });
  }

  onMonthChanged(e: { year: number; month: number }): void {
    this.year.set(e.year);
    this.month.set(e.month);
    this.load();
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formDescription = '';
    this.formAmount = 0;
    this.formDate = new Date().toISOString().split('T')[0];
    this.formCategoryId = this.categories()[0]?.id ?? '';
    this.formAccountId = '';
    this.formCreditCardId = '';
    this.formStatus = TransactionStatus.Realized;
    this.formInstallments = 1;
    this.formIsInstallment = false;
    this.formIsInternational = false;
    this.formOriginalCurrency = 'USD';
    this.formOriginalAmount = 0;
    this.formExchangeRate = 0;
    this.formLabels = [];
    this.showForm.set(true);
  }

  openEdit(tx: Transaction): void {
    this.editingId.set(tx.id);
    this.formDescription = tx.description;
    this.formAmount = tx.amount;
    this.formDate = tx.date;
    this.formCategoryId = tx.categoryId ?? '';
    this.formAccountId = tx.accountId ?? '';
    this.formCreditCardId = tx.creditCardId ?? '';
    this.formStatus = tx.status;
    this.formInstallments = tx.totalInstallments ?? 1;
    this.formIsInstallment = !!tx.totalInstallments && tx.totalInstallments > 1;
    this.formIsInternational = !!tx.originalCurrency;
    this.formOriginalCurrency = tx.originalCurrency ?? 'USD';
    this.formOriginalAmount = tx.originalAmount ?? 0;
    this.formExchangeRate = tx.exchangeRate ?? 0;
    this.formLabels = [...tx.labels];
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  save(): void {
    if (!this.formDescription.trim() || this.formAmount <= 0) return;
    this.saving.set(true);

    const payload: CreateTransactionPayload = {
      description: this.formDescription.trim(),
      amount: this.formAmount,
      date: this.formDate,
      categoryId: this.formCategoryId || null,
      accountId: this.formCreditCardId ? null : (this.formAccountId || null),
      creditCardId: this.formCreditCardId || null,
      status: this.formStatus,
      totalInstallments: this.formIsInstallment ? this.formInstallments : null,
      recurringTemplateId: null,
      originalCurrency: this.formIsInternational ? this.formOriginalCurrency : null,
      originalAmount: this.formIsInternational ? this.formOriginalAmount : null,
      exchangeRate: this.formIsInternational ? this.formExchangeRate : null,
      labels: this.formLabels,
    };

    const id = this.editingId();

    if (id) {
      this.transactionService.update(id, payload).subscribe({
        next: saved => {
          this.transactions.update(list => list.map(t => (t.id === id ? saved : t)));
          this.saving.set(false);
          this.closeForm();
          this.toast.success('Transação atualizada com sucesso!');
        },
        error: err => {
          this.logger.error('Failed to update transaction', err);
          this.saving.set(false);
          this.toast.error('Erro ao atualizar transação.');
        },
      });
    } else {
      this.transactionService.create(payload).subscribe({
        next: () => {
          this.load();
          this.saving.set(false);
          this.closeForm();
          this.toast.success('Transação adicionada com sucesso!');
        },
        error: err => {
          this.logger.error('Failed to create transaction', err);
          this.saving.set(false);
          this.toast.error('Erro ao criar transação.');
        },
      });
    }
  }

  delete(tx: Transaction): void {
    this.transactionService.delete(tx.id).subscribe({
      next: () => {
        this.transactions.update(list => list.filter(t => t.id !== tx.id));
        this.toast.success('Transação excluída.');
      },
      error: err => {
        this.logger.error('Failed to delete transaction', err);
        this.toast.error('Erro ao excluir transação.');
      },
    });
  }

  categoryName(id: string | null): string {
    return this.categories().find(c => c.id === id)?.name ?? '';
  }

  categoryColor(id: string | null): string {
    return this.categories().find(c => c.id === id)?.color ?? '#e5e7eb';
  }

  accountName(id: string | null): string {
    return this.accounts().find(a => a.id === id)?.name ?? '';
  }

  cardName(id: string | null): string {
    return this.cards().find(c => c.id === id)?.name ?? '';
  }
}
