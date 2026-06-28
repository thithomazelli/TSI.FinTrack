import { BillStatus } from '../enums/bill-status.enum';

export interface CreditCardBill {
  id: string;
  ownerId: string;
  creditCardId: string;
  year: number;
  month: number;
  totalAmount: number;
  status: BillStatus;
  closingDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}
