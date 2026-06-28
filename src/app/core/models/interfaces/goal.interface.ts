export interface Goal {
  id: string;
  ownerId: string;
  categoryId: string;
  monthlyLimit: number;
  year: number;
  month: number;
  createdAt: string;
  updatedAt: string;
}
