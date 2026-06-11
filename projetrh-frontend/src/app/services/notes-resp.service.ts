import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface NoteResp {
  id: number;
  userEmail: string;
  kpiKey?: string | null;
  kpiLabel?: string | null;
  kpiValue?: string | null;
  filterScope?: string | null;
  periodLabel?: string | null;
  title?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteRespCreateRequest {
  userEmail: string;
  kpiKey?: string | null;
  kpiLabel?: string | null;
  kpiValue?: string | null;
  filterScope?: string | null;
  periodLabel?: string | null;
  title?: string | null;
  content: string;
}

export interface NoteRespUpdateRequest {
  title?: string | null;
  content: string;
}

@Injectable({ providedIn: 'root' })
export class NotesRespService {
  private readonly http = inject(HttpClient);
  private readonly API_URL = 'http://localhost:8080/api/notes';

  private notesSubject = new BehaviorSubject<NoteResp[]>([]);

  /** Flux observable des notes de l'utilisateur connecté. */
  get notes$(): Observable<NoteResp[]> {
    return this.notesSubject.asObservable();
  }

  /** Synchronous snapshot of current notes. */
  get notesSnapshot(): NoteResp[] {
    return this.notesSubject.value;
  }

  /** Charge les notes de l'utilisateur connecté (identité dérivée du token côté serveur). */
  load(): void {
    this.http.get<NoteResp[]>(this.API_URL).subscribe({
      next: notes => this.notesSubject.next(this.normalizeDates(notes)),
      error: () => this.notesSubject.next([])
    });
  }

  /** Charge les notes et notifie le résultat (true = succès, false = erreur réseau). */
  loadWithCallback(callback: (success: boolean) => void): void {
    this.http.get<NoteResp[]>(this.API_URL).subscribe({
      next: notes => {
        this.notesSubject.next(this.normalizeDates(notes));
        callback(true);
      },
      error: () => {
        this.notesSubject.next([]);
        callback(false);
      }
    });
  }

  /** Crée une nouvelle note (KPI-liée ou libre) et met à jour le flux. */
  add(request: NoteRespCreateRequest): Observable<NoteResp> {
    return this.http.post<NoteResp>(this.API_URL, request).pipe(
      tap(note => this.notesSubject.next([this.normalizeNote(note), ...this.notesSubject.getValue()]))
    );
  }

  /** Met à jour le titre et/ou contenu d'une note existante. */
  update(noteId: number, req: NoteRespUpdateRequest): Observable<NoteResp> {
    return this.http.put<NoteResp>(`${this.API_URL}/${noteId}`, req).pipe(
      tap(updated => {
        const norm = this.normalizeNote(updated);
        const notes = this.notesSubject.getValue().map(n => n.id === norm.id ? norm : n);
        this.notesSubject.next(notes);
      })
    );
  }

  /** Supprime une note et met à jour le flux. */
  delete(noteId: number): Observable<void> {
    return this.http.delete<void>(`${this.API_URL}/${noteId}`).pipe(
      tap(() => {
        const notes = this.notesSubject.getValue().filter(n => n.id !== noteId);
        this.notesSubject.next(notes);
      })
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Normalisation des dates
  // Jackson peut sérialiser LocalDateTime comme tableau [y,mo,d,h,mi,s,nano]
  // ou comme chaîne ISO. Les deux formats sont gérés ici.
  // ─────────────────────────────────────────────────────────────

  private normalizeDates(notes: NoteResp[]): NoteResp[] {
    return notes.map(n => this.normalizeNote(n));
  }

  private normalizeNote(note: any): NoteResp {
    return {
      ...note,
      createdAt: this.toIsoString(note.createdAt),
      updatedAt: this.toIsoString(note.updatedAt)
    };
  }

  private toIsoString(val: any): string {
    if (!val) return '';
    if (typeof val === 'string') {
      // Truncate nanoseconds to milliseconds for JS Date compatibility
      // "2026-05-22T18:08:20.123456789" → "2026-05-22T18:08:20.123"
      return val.replace(/(\.\d{3})\d+/, '$1');
    }
    if (Array.isArray(val)) {
      // [year, month, day, hour, minute, second, nano?]
      const [y, mo, d, h = 0, mi = 0, s = 0] = val;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return String(val);
  }
}