import { TransactionStatus } from '../enums/transaction-status.enum';

export interface Transaction {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  date: string;
  categoryId: string;
  accountId: string | null;
  creditCardId: string | null;
  creditCardBillId: string | null;
  status: TransactionStatus;
  installmentNumber: number | null;
  totalInstallments: number | null;
  installmentGroupId: string | null;
  recurringTemplateId: string | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  exchangeRate: number | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}
