import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, Utilisateur } from '../../services/auth';
import { NoteResp, NoteRespCreateRequest, NotesRespService } from '../../services/notes-resp.service';
import { NotificationsPanelComponent } from '../../components/notifications-panel/notifications-panel';

@Component({
  selector: 'app-notes-resp',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, NotificationsPanelComponent, DatePipe],
  templateUrl: './notes-resp.html',
  styleUrl: './notes-resp.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotesRespComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notesService = inject(NotesRespService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly utilisateur: Utilisateur | null = this.auth.utilisateur;

  notes: NoteResp[] = [];
  loadError = false;

  // ── Édition inline ──────────────────────────────────────────
  editingNoteId: number | null = null;
  editingContent = '';
  editingTitle = '';

  // ── Filtre ─────────────────────────────────────────────────
  filterKpiKey = '';

  // ── Formulaire de création ──────────────────────────────────
  createFormOpen = false;
  createTitle = '';
  createContent = '';
  createError = '';

  private notesSub?: Subscription;

  get filteredNotes(): NoteResp[] {
    if (!this.filterKpiKey) return this.notes;
    if (this.filterKpiKey === '__kpi__') return this.notes.filter(n => !!n.kpiKey);
    if (this.filterKpiKey === '__free__') return this.notes.filter(n => !n.kpiKey);
    return this.notes;
  }

  get hasKpiNotes(): boolean {
    return this.notes.some(n => !!n.kpiKey);
  }

  get hasFreeNotes(): boolean {
    return this.notes.some(n => !n.kpiKey);
  }

  ngOnInit(): void {
    this.loadNotes();
    this.notesSub = this.notesService.notes$.subscribe(notes => {
      this.notes = notes;
      this.cdr.markForCheck();
    });
  }

  loadNotes(): void {
    this.loadError = false;
    this.cdr.markForCheck();
    this.notesService.loadWithCallback((ok) => {
      this.loadError = !ok;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.notesSub?.unsubscribe();
  }

  onDeconnexion(): void { this.auth.deconnexion(); this.router.navigate(['/login']); }
  onProfil(): void { this.router.navigate(['/profil']); }

  // ── Création ────────────────────────────────────────────────

  openCreateForm(): void {
    this.createFormOpen = true;
    this.createTitle = '';
    this.createContent = '';
    this.createError = '';
    this.cdr.markForCheck();
  }

  cancelCreate(): void {
    this.createFormOpen = false;
    this.createTitle = '';
    this.createContent = '';
    this.createError = '';
    this.cdr.markForCheck();
  }

  submitCreate(): void {
    const content = this.createContent.trim();
    if (!content) {
      this.createError = 'Le contenu est obligatoire.';
      this.cdr.markForCheck();
      return;
    }
    const request: NoteRespCreateRequest = {
      userEmail: this.utilisateur?.email ?? '',
      title: this.createTitle.trim() || null,
      content
    };
    this.notesService.add(request).subscribe({
      next: () => {
        this.createFormOpen = false;
        this.createTitle = '';
        this.createContent = '';
        this.createError = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.createError = 'Erreur lors de la création. Veuillez réessayer.';
        this.cdr.markForCheck();
      }
    });
  }

  // ── Édition ─────────────────────────────────────────────────

  startEdit(note: NoteResp): void {
    this.editingNoteId = note.id;
    this.editingContent = note.content;
    this.editingTitle = note.title ?? '';
    this.cdr.markForCheck();
  }

  saveEdit(noteId: number, textarea: HTMLTextAreaElement): void {
    const value = textarea.value.trim();
    if (!value) return;
    this.notesService.update(noteId, {
      title: this.editingTitle.trim() || null,
      content: value
    }).subscribe({
      next: () => {
        this.editingNoteId = null;
        this.editingContent = '';
        this.editingTitle = '';
        this.cdr.markForCheck();
      }
    });
  }

  cancelEdit(): void {
    this.editingNoteId = null;
    this.editingContent = '';
    this.editingTitle = '';
    this.cdr.markForCheck();
  }

  // ── Suppression ─────────────────────────────────────────────

  confirmDeleteId: number | null = null;

  deleteNote(noteId: number): void {
    this.confirmDeleteId = noteId;
    this.cdr.markForCheck();
  }

  confirmDelete(): void {
    if (this.confirmDeleteId === null) return;
    this.notesService.delete(this.confirmDeleteId).subscribe();
    this.confirmDeleteId = null;
    this.cdr.markForCheck();
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
    this.cdr.markForCheck();
  }

  // ── Filtre ─────────────────────────────────────────────────

  setFilter(kpiKey: string): void {
    this.filterKpiKey = this.filterKpiKey === kpiKey ? '' : kpiKey;
    this.cdr.markForCheck();
  }

  isKpiNote(note: NoteResp): boolean {
    return !!note.kpiKey;
  }

  getFilterScopeLabel(note: NoteResp): string {
    return note.filterScope?.trim() || 'Tous les départements';
  }

  isAllDepartmentsScope(note: NoteResp): boolean {
    const scope = this.getFilterScopeLabel(note).toLowerCase();
    return scope === 'tous les départements' || scope === 'tous';
  }
}
