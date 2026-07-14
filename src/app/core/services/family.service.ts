import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { LoggingService } from './logging.service';
import { AuthService } from '../auth/auth.service';
import { FamilyMember } from '../models/interfaces/family-member.interface';
import { FamilyRole } from '../models/enums/family-role.enum';

const MEMBERS_TABLE = 'family_members';
const INVITES_TABLE = 'family_invites';

export interface FamilyInvite {
  id: string;
  ownerId: string;
  email: string;
  role: FamilyRole;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FamilyService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggingService);
  private readonly auth = inject(AuthService);

  private get ownerId(): string {
    return this.auth.currentUser!.id;
  }

  async getMembers(): Promise<FamilyMember[]> {
    return this.supabase.client
      .from(MEMBERS_TABLE)
      .select('*, memberProfile:user_profiles!member_id(id, email, full_name, avatar_url)')
      .eq('owner_id', this.ownerId)
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as FamilyMember[];
      });
  }

  async getInvites(): Promise<FamilyInvite[]> {
    return this.supabase.client
      .from(INVITES_TABLE)
      .select('*')
      .eq('owner_id', this.ownerId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) throw error;
        return (data ?? []) as FamilyInvite[];
      });
  }

  async invite(email: string, role: FamilyRole): Promise<FamilyInvite> {
    this.logger.info('Inviting family member', email, role);
    return this.supabase.client
      .from(INVITES_TABLE)
      .insert({ owner_id: this.ownerId, email, role })
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as FamilyInvite;
      });
  }

  async updateMemberRole(memberId: string, role: FamilyRole): Promise<FamilyMember> {
    this.logger.info('Updating member role', memberId, role);
    return this.supabase.client
      .from(MEMBERS_TABLE)
      .update({ role })
      .eq('id', memberId)
      .eq('owner_id', this.ownerId)
      .select()
      .single()
      .then(({ data, error }) => {
        if (error) throw error;
        return data as FamilyMember;
      });
  }

  async revokeMember(memberId: string): Promise<void> {
    this.logger.info('Revoking family member', memberId);
    return this.supabase.client
      .from(MEMBERS_TABLE)
      .delete()
      .eq('id', memberId)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }

  async cancelInvite(inviteId: string): Promise<void> {
    return this.supabase.client
      .from(INVITES_TABLE)
      .delete()
      .eq('id', inviteId)
      .eq('owner_id', this.ownerId)
      .then(({ error }) => {
        if (error) throw error;
      });
  }
}
