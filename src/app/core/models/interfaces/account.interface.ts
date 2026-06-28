export interface Account {
  id: string;
  ownerId: string;
  name: string;
  typeId: string;
  balance: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}
