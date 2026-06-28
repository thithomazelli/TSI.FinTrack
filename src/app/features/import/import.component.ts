import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { TransactionService } from '../../core/services/transaction.service';
import { EntryService } from '../../core/services/entry.service';
import { CreditCardService } from '../../core/services/credit-card.service';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { AccountService } from '../../core/services/account.service';
import { CategoryService } from '../../core/services/category.service';
import { DomainListService } from '../../core/services/domain-list.service';
import { LoggingService } from '../../core/services/logging.service';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { Account } from '../../core/models/interfaces/account.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { DomainList } from '../../core/models/interfaces/domain-list.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { parseItauPDF, ParsedBill, ParsedTransaction } from '../../core/utils/itau-pdf-parser';
import { parseItauStatement, ParsedDebitRow } from '../../core/utils/itau-debit-parser';

type ImportMode = 'credit' | 'debit';

interface CreditReviewRow extends ParsedTransaction {
  selected: boolean;
  categoryId: string;
  status: TransactionStatus;
}

interface DebitReviewRow extends ParsedDebitRow {
  selected: boolean;
  categoryId: string;
  entryTypeId: string;
}

@Component({
  selector: 'tsi-import',
  standalone: true,
  imports: [DecimalPipe, SlicePipe, FormsModule, TranslatePipe],
  templateUrl: './import.component.html',
  styleUrls: ['./import.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportComponent implements OnInit {
  private readonly transactionService = inject(TransactionService);
  private readonly entryService = inject(EntryService);
  private readonly cardService = inject(CreditCardService);
  private readonly billService = inject(CreditCardBillService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly domainService = inject(DomainListService);
  private readonly logger = inject(LoggingService);

  readonly TransactionStatus = TransactionStatus;

  readonly mode = signal<ImportMode>('credit');
  readonly step = signal<'upload' | 'review' | 'done'>('upload');

  readonly cards = signal<CreditCard[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly entryTypes = signal<DomainList[]>([]);

  readonly parsing = signal(false);
  readonly importing = signal(false);
  readonly error = signal<string | null>(null);

  // Credit card import state
  readonly parsedBill = signal<ParsedBill | null>(null);
  readonly creditRows = signal<CreditReviewRow[]>([]);
  readonly selectedCardId = signal('');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedMonth = signal(new Date().getMonth() + 1);

  // Debit statement import state
  readonly debitRows = signal<DebitReviewRow[]>([]);
  readonly selectedAccountId = signal('');
  readonly importedCount = signal(0);

  readonly currentYear = new Date().getFullYear();

  readonly creditSelectedCount = computed(() => this.creditRows().filter((r) => r.selected).length);
  readonly creditTotal = computed(() =>
    this.creditRows().filter((r) => r.selected).reduce((s, r) => s + r.amount, 0)
  );

  readonly debitSelectedCount = computed(() => this.debitRows().filter((r) => r.selected).length);
  readonly debitTotalExpenses = computed(() =>
    this.debitRows().filter((r) => r.selected && !r.isCredit).reduce((s, r) => s + r.amount, 0)
  );
  readonly debitTotalIncome = computed(() =>
    this.debitRows().filter((r) => r.selected && r.isCredit).reduce((s, r) => s + r.amount, 0)
  );

  ngOnInit(): void {
    this.cardService.getAll(false).subscribe({
      next: (cards) => {
        this.cards.set(cards);
        if (cards.length > 0) this.selectedCardId.set(cards[0].id);
      },
      error: (err) => this.logger.error('Failed to load cards', err),
    });
    this.accountService.getAll(false).subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        if (accounts.length > 0) this.selectedAccountId.set(accounts[0].id);
      },
      error: (err) => this.logger.error('Failed to load accounts', err),
    });
    this.categoryService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => this.logger.error('Failed to load categories', err),
    });
    this.domainService.getByCode('entry_type').subscribe({
      next: (types) => this.entryTypes.set(types),
      error: (err) => this.logger.error('Failed to load entry types', err),
    });
  }

  setMode(mode: ImportMode): void {
    this.mode.set(mode);
    this.reset();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      this.error.set('Selecione um arquivo PDF válido.');
      return;
    }
    this.error.set(null);
    this.parsing.set(true);

    try {
      if (this.mode() === 'credit') {
        await this.parseCreditPDF(file);
      } else {
        await this.parseDebitPDF(file);
      }
      this.step.set('review');
    } catch (err) {
      this.logger.error('PDF parse error', err);
      this.error.set('Erro ao processar o PDF. Verifique se é um extrato Itaú válido.');
    } finally {
      this.parsing.set(false);
      input.value = '';
    }
  }

  private async parseCreditPDF(file: File): Promise<void> {
    const bill = await parseItauPDF(file);
    this.parsedBill.set(bill);

    if (bill.cardLastFour) {
      const matched = this.cards().find((c) => c.lastFourDigits === bill.cardLastFour);
      if (matched) this.selectedCardId.set(matched.id);
    }
    if (bill.dueDate) {
      const d = new Date(bill.dueDate);
      this.selectedYear.set(d.getFullYear());
      this.selectedMonth.set(d.getMonth() + 1);
    }

    this.creditRows.set(
      bill.transactions
        .filter((t) => !t.isPayment)
        .map((t) => ({
          ...t,
          selected: true,
          categoryId: '',
          status: t.isFuture ? TransactionStatus.Projected : TransactionStatus.Realized,
        }))
    );
  }

  private async parseDebitPDF(file: File): Promise<void> {
    const stmt = await parseItauStatement(file);

    this.debitRows.set(
      stmt.rows.map((r) => ({
        ...r,
        selected: true,
        categoryId: '',
        entryTypeId: this.entryTypes()[0]?.id ?? '',
      }))
    );
  }

  // --- Credit row helpers ---
  setCreditCategory(i: number, categoryId: string): void {
    this.creditRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, categoryId } : r)));
  }
  setCreditStatus(i: number, status: TransactionStatus): void {
    this.creditRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, status } : r)));
  }
  toggleCreditRow(i: number): void {
    this.creditRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  }
  toggleAllCredit(selected: boolean): void {
    this.creditRows.update((rows) => rows.map((r) => ({ ...r, selected })));
  }

  // --- Debit row helpers ---
  setDebitCategory(i: number, categoryId: string): void {
    this.debitRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, categoryId } : r)));
  }
  setDebitEntryType(i: number, entryTypeId: string): void {
    this.debitRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, entryTypeId } : r)));
  }
  toggleDebitRow(i: number): void {
    this.debitRows.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  }
  toggleAllDebit(selected: boolean): void {
    this.debitRows.update((rows) => rows.map((r) => ({ ...r, selected })));
  }

  // --- Import ---
  async confirmImport(): Promise<void> {
    this.importing.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'credit') {
        await this.importCredit();
      } else {
        await this.importDebit();
      }
      this.step.set('done');
    } catch (err) {
      this.logger.error('Import failed', err);
      this.error.set('Erro ao importar. Tente novamente.');
    } finally {
      this.importing.set(false);
    }
  }

  private async importCredit(): Promise<void> {
    const cardId = this.selectedCardId();
    const year = this.selectedYear();
    const month = this.selectedMonth();
    if (!cardId) throw new Error('No card selected');

    const bill = await this.billService.upsert({ creditCardId: cardId, year, month }).toPromise();
    const selected = this.creditRows().filter((r) => r.selected);
    let count = 0;

    for (const row of selected) {
      await this.transactionService.create({
        description: row.description,
        amount: row.amount,
        date: row.date,
        categoryId: row.categoryId || null,
        accountId: null,
        creditCardId: cardId,
        status: row.status,
        totalInstallments: null,
        recurringTemplateId: null,
        originalCurrency: row.originalCurrency,
        originalAmount: row.originalAmount,
        exchangeRate: row.exchangeRate,
        labels: [],
      }).toPromise();
      count++;
    }
    this.importedCount.set(count);
    this.logger.info(`Imported ${count} credit card transactions`);
  }

  private async importDebit(): Promise<void> {
    const accountId = this.selectedAccountId() || null;
    const selected = this.debitRows().filter((r) => r.selected);
    let count = 0;

    for (const row of selected) {
      if (row.isCredit) {
        // Income → Entry
        await this.entryService.create({
          description: row.description,
          amount: row.amount,
          date: row.date,
          typeId: row.entryTypeId || null,
          accountId,
          labels: [],
        }).toPromise();
      } else {
        // Expense → Transaction
        await this.transactionService.create({
          description: row.description,
          amount: row.amount,
          date: row.date,
          categoryId: row.categoryId || null,
          accountId,
          creditCardId: null,
          status: TransactionStatus.Realized,
          totalInstallments: null,
          recurringTemplateId: null,
          originalCurrency: null,
          originalAmount: null,
          exchangeRate: null,
          labels: [],
        }).toPromise();
      }
      count++;
    }
    this.importedCount.set(count);
    this.logger.info(`Imported ${count} debit statement rows`);
  }

  reset(): void {
    this.step.set('upload');
    this.parsedBill.set(null);
    this.creditRows.set([]);
    this.debitRows.set([]);
    this.error.set(null);
    this.importedCount.set(0);
  }

  monthLabel(m: number): string {
    return new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  }
}
