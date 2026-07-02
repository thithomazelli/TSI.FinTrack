export interface CreditCard {
  id: string;
  ownerId: string;
  name: string;
  lastFourDigits: string;
  creditLimit: number;
  closingDay: number;
  dueDay: number;
  isArchived: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
