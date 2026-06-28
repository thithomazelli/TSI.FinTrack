export interface RecurringTemplate {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  categoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  type: 'TRANSACTION' | 'ENTRY';
  dayOfMonth: number;
  isActive: boolean;
  createdAt: string;
}
