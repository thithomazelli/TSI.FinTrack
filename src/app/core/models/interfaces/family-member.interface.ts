import { FamilyRole } from '../enums/family-role.enum';

export interface FamilyMember {
  id: string;
  ownerId: string;
  memberId: string;
  role: FamilyRole;
  memberProfile: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
}
