import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PageResponse } from '../models/page-response.model';

export type AdminUserRole = 'ADMIN' | 'MANAGER' | 'RESPONSABLE_RH';
export type AdminUserStatut = 'actif' | 'inactif';

export interface AdminUser {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: AdminUserRole;
  statut: AdminUserStatut;
  dateCreation: string; // YYYY-MM-DD
  derniereConnexion: string; // ISO string or empty
  validated: boolean;
}

export interface AdminRole {
  id: string;
  nom: AdminUserRole;
  couleur: string;
  permissions: string[];
}

export interface AdminLog {
  id: string;
  action:
    | 'CREATION_UTILISATEUR'
    | 'MODIFICATION_ROLE'
    | 'MODIFICATION_UTILISATEUR'
    | 'SUPPRESSION'
    | 'DESACTIVATION_COMPTE'
    | 'ACTIVATION_COMPTE'
    | 'VALIDATION_COMPTE'
    | 'REINITIALISATION_MDP'
    | 'CHANGEMENT_MDP'
    | 'CONNEXION';
  cible: string;
  effectuePar: string;
  date: string; // ISO string
  details: string;
}

export interface DashboardStats {
  totalUsers: number;
  actifs: number;
  inactifs: number;
  recentConnections: number;
  activeRolesCount: number;
  activeRolesLabel: string;
  pendingValidationCount: number;
}

export interface MonthlyCount {
  mois: string;
  total: number;
}

export interface RhMovement {
  employe: string;
  type: string;
  statut: string;
  dateDebut: string;
  dateFin: string;
  demandeLe: string;
}

export interface RhOverview {
  effectifTotal: number;
  embauches30Jours: number;
  congesEnAttente: number;
  congesApprouvesAnnee: number;
  congesRefusesAnnee: number;
  tauxPresence30Jours: number;
  evaluationsAnnee: number;
  seuilsKpiConfigures: number;
  demandesCongesParMois: MonthlyCount[];
  derniersMouvements: RhMovement[];
}

export interface ManagerOverviewRow {
  employeeId: number;
  nom: string;
  departement: string;
  compteActif: boolean;
  tailleEquipe: number;
  objectifs: number;
  avancementMoyen: number;
  objectifsEnRisque: number;
  evaluationsAnnee: number;
  absencesEnAttente: number;
}

export interface ManagersOverview {
  totalManagers: number;
  managersAvecCompteActif: number;
  avancementOkrMoyen: number;
  objectifsEnRisque: number;
  absencesEnAttenteTotal: number;
  evaluationsAnnee: number;
  managers: ManagerOverviewRow[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly apiUrl = 'http://localhost:8080/api/admin';

  constructor(private http: HttpClient) {}

  getUsers(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(`${this.apiUrl}/users`).pipe(
      map((users) => users.map((u) => this.normalizeUser(u)))
    );
  }

  getRoles(): Observable<AdminRole[]> {
    return this.http.get<AdminRole[]>(`${this.apiUrl}/roles`);
  }

  getLogs(): Observable<AdminLog[]> {
    return this.getLogsPage({ unpaged: true }).pipe(
      map((page) => (page.content ?? []).slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
    );
  }

  getLogsPage(params?: {
    page?: number;
    size?: number;
    search?: string;
    tab?: string;
    cible?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: 'asc' | 'desc';
    unpaged?: boolean;
  }): Observable<PageResponse<AdminLog>> {
    let httpParams = new HttpParams();
    if (params?.unpaged) {
      httpParams = httpParams.set('unpaged', 'true');
    } else {
      httpParams = httpParams
        .set('page', String(params?.page ?? 0))
        .set('size', String(params?.size ?? 10));
    }
    if (params?.search?.trim()) httpParams = httpParams.set('search', params.search.trim());
    if (params?.tab) httpParams = httpParams.set('tab', params.tab);
    if (params?.cible) httpParams = httpParams.set('cible', params.cible);
    if (params?.dateFrom) httpParams = httpParams.set('dateFrom', params.dateFrom);
    if (params?.dateTo) httpParams = httpParams.set('dateTo', params.dateTo);
    if (params?.sort) httpParams = httpParams.set('sort', params.sort);

    return this.http.get<PageResponse<AdminLog>>(`${this.apiUrl}/logs`, { params: httpParams }).pipe(
      map((page) => ({
        ...page,
        content: (page.content ?? []).map((log) => this.normalizeLog(log))
      }))
    );
  }

  getLogTargets(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/logs/targets`);
  }

  private normalizeLog(log: AdminLog): AdminLog {
    return {
      ...log,
      date: log.date || '',
      details: log.details || '',
      cible: log.cible || '',
      effectuePar: log.effectuePar || ''
    };
  }

  getDashboardStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.apiUrl}/dashboard`);
  }

  getRhOverview(): Observable<RhOverview> {
    return this.http.get<RhOverview>(`${this.apiUrl}/overview/rh`);
  }

  getManagersOverview(): Observable<ManagersOverview> {
    return this.http.get<ManagersOverview>(`${this.apiUrl}/overview/managers`);
  }

  addUser(payload: AdminUserMutationPayload): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${this.apiUrl}/users`, payload).pipe(
      map((u) => this.normalizeUser(u))
    );
  }

  updateUser(userId: string, payload: AdminUserMutationPayload): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(userId)}`, payload).pipe(
      map((u) => this.normalizeUser(u))
    );
  }

  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/${encodeURIComponent(userId)}`);
  }

  assignRole(userId: string, newRole: AdminUserRole): Observable<AdminUser> {
    return this.http
      .put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(userId)}/role`, { role: newRole })
      .pipe(map((u) => this.normalizeUser(u)));
  }

  toggleUserStatus(userId: string): Observable<AdminUser> {
    return this.http
      .put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(userId)}/status/toggle`, {})
      .pipe(map((u) => this.normalizeUser(u)));
  }

  validateAccount(userId: string): Observable<AdminUser> {
    return this.http
      .put<AdminUser>(`${this.apiUrl}/users/${encodeURIComponent(userId)}/validate`, {})
      .pipe(map((u) => this.normalizeUser(u)));
  }

  resetPassword(userId: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${encodeURIComponent(userId)}/reset-password`, {
      password: newPassword
    });
  }

  private normalizeUser(user: AdminUser): AdminUser {
    return {
      ...user,
      role: (user.role || 'MANAGER') as AdminUserRole,
      statut: (user.statut || 'actif') as AdminUserStatut,
      dateCreation: user.dateCreation || '',
      derniereConnexion: user.derniereConnexion || '',
      validated: !!user.validated
    };
  }
}

export interface AdminUserMutationPayload {
  nom: string;
  prenom: string;
  email: string;
  role: AdminUserRole;
  statut: AdminUserStatut;
  validated: boolean;
  password?: string;
}

