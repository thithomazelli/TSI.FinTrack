export type AccountKind = 'checking' | 'savings';

export interface Account {
  id: string;
  ownerId: string;
  name: string;
  typeId: string;
  kind: AccountKind;
  balance: number;
  openedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
