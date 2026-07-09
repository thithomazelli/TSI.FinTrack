export interface SavingsMovement {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  date: string;
  typeId: string;
  typeCode: string;   // 'DEPOSIT' | 'WITHDRAWAL'
  accountId: string;
  createdAt: string;
  updatedAt: string;
}
