export interface Entry {
  id: string;
  ownerId: string;
  description: string;
  amount: number;
  date: string;
  typeId: string;
  accountId: string | null;
  recurringTemplateId: string | null;
  labels: string[];
  status?: string;
  position?: number;
  installmentNumber: number | null;
  totalInstallments: number | null;
  createdAt: string;
  updatedAt: string;
}
