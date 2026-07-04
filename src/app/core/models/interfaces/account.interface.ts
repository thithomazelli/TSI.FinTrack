export interface Account {
  id: string;
  ownerId: string;
  name: string;
  typeId: string;
  balance: number;
  openedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
