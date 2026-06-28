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
import { CreditCardService } from '../../core/services/credit-card.service';
import { CreditCardBillService } from '../../core/services/credit-card-bill.service';
import { CategoryService } from '../../core/services/category.service';
import { LoggingService } from '../../core/services/logging.service';
import { CreditCard } from '../../core/models/interfaces/credit-card.interface';
import { Category } from '../../core/models/interfaces/category.interface';
import { TransactionStatus } from '../../core/models/enums/transaction-status.enum';
import { parseItauPDF, ParsedBill, ParsedTransaction } from '../../core/utils/itau-pdf-parser';

interface ReviewRow extends ParsedTransaction {
  selected: boolean;
  categoryId: string;
  status: TransactionStatus;
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
  private readonly cardService = inject(CreditCardService);
  private readonly billService = inject(CreditCardBillService);
  private readonly categoryService = inject(CategoryService);
  private readonly logger = inject(LoggingService);

  readonly TransactionStatus = TransactionStatus;

  readonly cards = signal<CreditCard[]>([]);
  readonly categories = signal<Category[]>([]);

  readonly parsing = signal(false);
  readonly importing = signal(false);
  readonly importDone = signal(false);
  readonly error = signal<string | null>(null);

  readonly parsedBill = signal<ParsedBill | null>(null);
  readonly reviewRows = signal<ReviewRow[]>([]);

  readonly selectedCardId = signal('');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedMonth = signal(new Date().getMonth() + 1);

  readonly step = signal<'upload' | 'review' | 'done'>('upload');

  readonly selectedCount = computed(() => this.reviewRows().filter((r) => r.selected).length);
  readonly totalSelected = computed(() =>
    this.reviewRows()
      .filter((r) => r.selected)
      .reduce((s, r) => s + r.amount, 0)
  );

  readonly currentYear = new Date().getFullYear();

  ngOnInit(): void {
    this.cardService.getAll(false).subscribe({
      next: (cards) => {
        this.cards.set(cards);
        if (cards.length > 0) this.selectedCardId.set(cards[0].id);
      },
      error: (err) => this.logger.error('Failed to load cards', err),
    });
    this.categoryService.getAll().subscribe({
      next: (cats) => this.categories.set(cats),
      error: (err) => this.logger.error('Failed to load categories', err),
    });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      this.error.set('Selecione um arquivo PDF.');
      return;
    }
    this.error.set(null);
    this.parsing.set(true);
    try {
      const bill = await parseItauPDF(file);
      this.parsedBill.set(bill);

      // Auto-detect card by last four digits
      if (bill.cardLastFour) {
        const matched = this.cards().find((c) => c.lastFourDigits === bill.cardLastFour);
        if (matched) this.selectedCardId.set(matched.id);
      }

      // Auto-detect month from due date
      if (bill.dueDate) {
        const d = new Date(bill.dueDate);
        this.selectedYear.set(d.getFullYear());
        this.selectedMonth.set(d.getMonth() + 1);
      }

      const rows: ReviewRow[] = bill.transactions
        .filter((t) => !t.isPayment)
        .map((t) => ({
          ...t,
          selected: true,
          categoryId: '',
          status: t.isFuture ? TransactionStatus.Projected : TransactionStatus.Realized,
        }));
      this.reviewRows.set(rows);
      this.step.set('review');
    } catch (err) {
      this.logger.error('PDF parse error', err);
      this.error.set('Erro ao processar o PDF. Verifique se é um extrato Itaú válido.');
    } finally {
      this.parsing.set(false);
    }
  }

  toggleAll(selected: boolean): void {
    this.reviewRows.update((rows) => rows.map((r) => ({ ...r, selected })));
  }

  setCategory(index: number, categoryId: string): void {
    this.reviewRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, categoryId } : r))
    );
  }

  setStatus(index: number, status: TransactionStatus): void {
    this.reviewRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, status } : r))
    );
  }

  toggleRow(index: number): void {
    this.reviewRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, selected: !r.selected } : r))
    );
  }

  async confirmImport(): Promise<void> {
    const cardId = this.selectedCardId();
    const year = this.selectedYear();
    const month = this.selectedMonth();
    if (!cardId) return;

    this.importing.set(true);
    this.error.set(null);

    try {
      // Upsert bill first
      const bill = await this.billService.upsert({ creditCardId: cardId, year, month }).toPromise();

      const selected = this.reviewRows().filter((r) => r.selected);
      let completed = 0;

      for (const row of selected) {
        await this.transactionService
          .create({
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
          })
          .toPromise();
        completed++;
      }

      this.logger.info(`Imported ${completed} transactions`);
      this.step.set('done');
    } catch (err) {
      this.logger.error('Import failed', err);
      this.error.set('Erro ao importar. Tente novamente.');
    } finally {
      this.importing.set(false);
    }
  }

  reset(): void {
    this.step.set('upload');
    this.parsedBill.set(null);
    this.reviewRows.set([]);
    this.error.set(null);
    this.importDone.set(false);
  }

  monthLabel(m: number): string {
    return new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  }
}
