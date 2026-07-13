import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, TimeoutError, throwError, timeout } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface Utilisateur {
  email:     string;
  nom:       string;
  prenom:    string;
  role:      string;
  initiales: string;
  route:     string;
  employeeId?: number;
  userId?: number;
}

export interface SsoResponse {
  token:       string;
  email:       string;
  displayName: string;
  role:        string;
  route:       string;
  employeeId?: number | null;
  userId?:     number | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly STORAGE_KEY     = 'currentUser';
  private readonly SSO_TOKEN_KEY   = 'ssoToken';
  private readonly API_URL         = 'http://localhost:8080/api/auth';
  /** Évite un spinner infini si le backend ne répond pas. */
  private readonly REQUEST_TIMEOUT_MS = 15000;
  private readonly INVALID_LOGIN_MSG = 'Email ou mot de passe invalide.';
  private readonly NETWORK_MSG =
    'Impossible de joindre le serveur. Vérifiez que le backend est démarré.';

  private _utilisateurConnecte: Utilisateur | null = null;

  constructor(private http: HttpClient) {
    const storage = this.getStorage();
    if (storage) {
      const raw = storage.getItem(this.STORAGE_KEY);
      if (raw) {
        try {
          this._utilisateurConnecte = this.normalizeRoute(JSON.parse(raw) as Utilisateur);
          storage.setItem(this.STORAGE_KEY, JSON.stringify(this._utilisateurConnecte));
        } catch {
          this._utilisateurConnecte = null;
          storage.removeItem(this.STORAGE_KEY);
        }
      }
    }
  }

  connexion(email: string, mdp: string): Observable<Utilisateur> {
    return this.http.post<SsoResponse>(`${this.API_URL}/login`, { email, password: mdp }).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      map((res) => this.persistFromResponse(res)),
      catchError((err) =>
        throwError(() => new Error(this.resolveLoginHttpError(err))))
    );
  }

  get utilisateur(): Utilisateur | null {
    return this._utilisateurConnecte;
  }

  getCurrentUser(): Utilisateur | null {
    return this._utilisateurConnecte;
  }

  /**
   * Authentification SSO via le domaine Active Directory EMEAAD.
   * Envoie les identifiants Windows au backend qui les valide via LDAP AD.
   */
  ssoConnexion(username: string, password: string): Observable<Utilisateur> {
    return this.http.post<SsoResponse>(`${this.API_URL}/sso`, { username, password }).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      map((res) => this.persistFromResponse(res)),
      catchError((err) =>
        throwError(() => new Error(this.resolveSsoHttpError(err))))
    );
  }

  getSsoToken(): string | null {
    const storage = this.getStorage();
    return storage ? storage.getItem(this.SSO_TOKEN_KEY) : null;
  }

  deconnexion() {
    this._utilisateurConnecte = null;
    const storage = this.getStorage();
    if (storage) {
      storage.removeItem(this.STORAGE_KEY);
      storage.removeItem(this.SSO_TOKEN_KEY);
    }
  }

  changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Observable<any> {
    return this.http.post(`http://localhost:8080/api/users/change-password`, {
      currentPassword,
      newPassword,
      confirmPassword
    }).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      catchError((err) =>
        throwError(() => new Error(this.resolveChangePasswordError(err))))
    );
  }

  /** Persiste le prénom/nom/email en base via l'API, puis reflète le résultat côté client. */
  updateProfile(firstName: string, lastName: string, email: string): Observable<{ email: string; firstName: string; lastName: string }> {
    return this.http.put<{ email: string; firstName: string; lastName: string }>(`http://localhost:8080/api/users/me`, {
      firstName,
      lastName,
      email
    }).pipe(
      timeout(this.REQUEST_TIMEOUT_MS),
      catchError((err) =>
        throwError(() => new Error(this.resolveUpdateProfileError(err))))
    );
  }

  /** Met à jour l'utilisateur courant en mémoire et dans le stockage local (source de vérité UI). */
  updateStoredUser(partial: Partial<Utilisateur>): void {
    if (!this._utilisateurConnecte) return;
    this._utilisateurConnecte = { ...this._utilisateurConnecte, ...partial };
    const storage = this.getStorage();
    if (storage) {
      storage.setItem(this.STORAGE_KEY, JSON.stringify(this._utilisateurConnecte));
    }
  }

  private getStorage(): Storage | null {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
    if (!g || !g.localStorage) return null;
    return g.localStorage as Storage;
  }

  private normalizeRoute(user: Utilisateur | null): Utilisateur | null {
    if (!user) {
      return null;
    }
    if (user.role === 'Administrateur RH' && user.route === '/accueil-admin') {
      return { ...user, route: '/accueil-resp' };
    }
    return user;
  }

  private persistFromResponse(res: SsoResponse): Utilisateur {
    const parts = res.displayName.split(' ').filter(Boolean);
    const utilisateur: Utilisateur = {
      email:     res.email,
      nom:       parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? res.email),
      prenom:    parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      role:      res.role,
      initiales: parts
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'NA',
      route:     res.route,
      employeeId: typeof res.employeeId === 'number' ? res.employeeId : undefined,
      userId:    typeof res.userId === 'number' ? res.userId : undefined
    };

    const normalized = this.normalizeRoute(utilisateur) ?? utilisateur;
    this._utilisateurConnecte = normalized;
    const storage = this.getStorage();
    if (storage && normalized) {
      storage.setItem(this.STORAGE_KEY, JSON.stringify(normalized));
      storage.setItem(this.SSO_TOKEN_KEY, res.token);
    }
    return normalized;
  }

  /** Message unique pour identifiants incorrects ou utilisateur inconnu (pas d'énumération). */
  private resolveLoginHttpError(err: unknown): string {
    if (err instanceof TimeoutError) {
      return this.INVALID_LOGIN_MSG;
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401 || err.status === 403) {
        return this.INVALID_LOGIN_MSG;
      }
      if (err.status === 0) {
        return this.NETWORK_MSG;
      }
      if (err.status === 400) {
        const bodyErr = this.readBodyError(err);
        if (bodyErr) return bodyErr;
      }
      return this.INVALID_LOGIN_MSG;
    }
    return this.INVALID_LOGIN_MSG;
  }

  private resolveSsoHttpError(err: unknown): string {
    if (err instanceof TimeoutError) {
      return 'Délai dépassé. Vérifiez votre réseau ou réessayez.';
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401 || err.status === 403) {
        const bodyErr = this.readBodyError(err);
        return bodyErr ?? 'Identifiants Windows invalides ou accès refusé.';
      }
      if (err.status === 0) {
        return this.NETWORK_MSG;
      }
      const bodyErr = this.readBodyError(err);
      return bodyErr ?? 'Erreur SSO. Réessayez ou contactez votre administrateur.';
    }
    return 'Erreur SSO. Réessayez.';
  }

  private readBodyError(err: HttpErrorResponse): string | null {
    const body = err.error;
    if (body && typeof body === 'object' && 'error' in body) {
      const e = (body as { error?: unknown }).error;
      if (typeof e === 'string' && e.trim()) return e.trim();
    }
    return null;
  }

  private resolveChangePasswordError(err: unknown): string {
    if (err instanceof TimeoutError) {
      return 'Délai dépassé. Vérifiez votre réseau ou réessayez.';
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400) {
        const bodyErr = this.readBodyError(err);
        if (bodyErr) return bodyErr;
      }
      if (err.status === 401) {
        return 'Mot de passe actuel incorrect.';
      }
      if (err.status === 0) {
        return this.NETWORK_MSG;
      }
      return 'Erreur lors de la modification du mot de passe.';
    }
    return 'Erreur lors de la modification du mot de passe.';
  }

  private resolveUpdateProfileError(err: unknown): string {
    if (err instanceof TimeoutError) {
      return 'Délai dépassé. Vérifiez votre réseau ou réessayez.';
    }
    if (err instanceof HttpErrorResponse) {
      if (err.status === 400 || err.status === 409) {
        const bodyErr = this.readBodyError(err);
        if (bodyErr) return bodyErr;
      }
      if (err.status === 0) {
        return this.NETWORK_MSG;
      }
      return 'Erreur lors de la mise à jour du profil.';
    }
    return 'Erreur lors de la mise à jour du profil.';
  }
}