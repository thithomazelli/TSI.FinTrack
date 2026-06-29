import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { FamilyService, FamilyInvite } from '../../../core/services/family.service';
import { LoggingService } from '../../../core/services/logging.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FamilyMember } from '../../../core/models/interfaces/family-member.interface';
import { FamilyRole } from '../../../core/models/enums/family-role.enum';

@Component({
  selector: 'tsi-family-settings',
  standalone: true,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './family-settings.component.html',
  styleUrls: ['./family-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilySettingsComponent implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly logger = inject(LoggingService);
  private readonly toast = inject(ToastService);

  readonly FamilyRole = FamilyRole;

  readonly members = signal<FamilyMember[]>([]);
  readonly invites = signal<FamilyInvite[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);
  readonly deletingItem = signal<FamilyMember | null>(null);

  readonly formEmail = signal('');
  readonly formRole = signal<FamilyRole>(FamilyRole.Viewer);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.familyService.getMembers().subscribe({
      next: (members) => this.members.set(members),
      error: (err) => this.logger.error('Failed to load members', err),
    });
    this.familyService.getInvites().subscribe({
      next: (invites) => {
        this.invites.set(invites);
        this.loading.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to load invites', err);
        this.loading.set(false);
      },
    });
  }

  openForm(): void {
    this.formEmail.set('');
    this.formRole.set(FamilyRole.Viewer);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
  }

  sendInvite(): void {
    const email = this.formEmail().trim();
    if (!email) return;
    this.saving.set(true);
    this.familyService.invite(email, this.formRole()).subscribe({
      next: (invite) => {
        this.invites.update((list) => [invite, ...list]);
        this.toast.success('Membro convidado com sucesso!');
        this.saving.set(false);
        this.closeForm();
      },
      error: (err) => {
        this.logger.error('Failed to send invite', err);
        this.toast.error('Erro ao enviar convite.');
        this.saving.set(false);
      },
    });
  }

  updateRole(member: FamilyMember, role: FamilyRole): void {
    this.familyService.updateMemberRole(member.id, role).subscribe({
      next: (updated) => {
        this.members.update((list) =>
          list.map((m) => (m.id === updated.id ? { ...m, role: updated.role } : m))
        );
        this.toast.success('Membro atualizado com sucesso!');
      },
      error: (err) => {
        this.logger.error('Failed to update role', err);
        this.toast.error('Erro ao atualizar membro.');
      },
    });
  }

  confirmDelete(member: FamilyMember): void {
    this.deletingItem.set(member);
  }

  cancelDelete(): void {
    this.deletingItem.set(null);
  }

  revoke(): void {
    const member = this.deletingItem();
    if (!member) return;
    this.saving.set(true);
    this.familyService.revokeMember(member.id).subscribe({
      next: () => {
        this.members.update((list) => list.filter((m) => m.id !== member.id));
        this.toast.success('Membro removido.');
        this.deletingItem.set(null);
        this.saving.set(false);
      },
      error: (err) => {
        this.logger.error('Failed to revoke member', err);
        this.toast.error('Erro ao remover membro.');
        this.saving.set(false);
      },
    });
  }

  cancelInvite(invite: FamilyInvite): void {
    this.familyService.cancelInvite(invite.id).subscribe({
      next: () => {
        this.invites.update((list) => list.filter((i) => i.id !== invite.id));
        this.toast.success('Convite cancelado.');
      },
      error: (err) => {
        this.logger.error('Failed to cancel invite', err);
        this.toast.error('Erro ao cancelar convite.');
      },
    });
  }
}
