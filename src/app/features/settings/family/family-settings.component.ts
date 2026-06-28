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
import { FamilyMember } from '../../../core/models/interfaces/family-member.interface';
import { FamilyRole } from '../../../core/models/enums/family-role.enum';

@Component({
  selector: 'tsi-family-settings',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './family-settings.component.html',
  styleUrls: ['./family-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilySettingsComponent implements OnInit {
  private readonly familyService = inject(FamilyService);
  private readonly logger = inject(LoggingService);

  readonly FamilyRole = FamilyRole;

  readonly members = signal<FamilyMember[]>([]);
  readonly invites = signal<FamilyInvite[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly showForm = signal(false);

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
        this.saving.set(false);
        this.closeForm();
      },
      error: (err) => {
        this.logger.error('Failed to send invite', err);
        this.saving.set(false);
      },
    });
  }

  updateRole(member: FamilyMember, role: FamilyRole): void {
    this.familyService.updateMemberRole(member.id, role).subscribe({
      next: (updated) =>
        this.members.update((list) =>
          list.map((m) => (m.id === updated.id ? { ...m, role: updated.role } : m))
        ),
      error: (err) => this.logger.error('Failed to update role', err),
    });
  }

  revoke(member: FamilyMember): void {
    if (!confirm('')) return;
    this.familyService.revokeMember(member.id).subscribe({
      next: () => this.members.update((list) => list.filter((m) => m.id !== member.id)),
      error: (err) => this.logger.error('Failed to revoke member', err),
    });
  }

  cancelInvite(invite: FamilyInvite): void {
    this.familyService.cancelInvite(invite.id).subscribe({
      next: () => this.invites.update((list) => list.filter((i) => i.id !== invite.id)),
      error: (err) => this.logger.error('Failed to cancel invite', err),
    });
  }
}
