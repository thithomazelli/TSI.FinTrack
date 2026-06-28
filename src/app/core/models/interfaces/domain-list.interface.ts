export interface DomainList {
  id: string;
  ownerId: string;
  code: string;
  name: string;
  value: string;
  color: string | null;
  isDefault: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
}
