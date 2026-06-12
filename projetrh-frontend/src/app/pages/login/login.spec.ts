import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { LoginComponent } from './login';
import { AuthService } from '../../services/auth';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authConnexion: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    authConnexion = vi.fn();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            connexion: authConnexion,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows validation error when fields are empty', () => {
    component.email = '';
    component.motDePasse = '';

    component.onConnexion();

    expect(component.erreur).toBe('Veuillez remplir tous les champs.');
    expect(authConnexion).not.toHaveBeenCalled();
  });

  it('navigates on successful login', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    authConnexion.mockReturnValue(
      of({
        email: 'rh@test.com',
        nom: 'Ben',
        prenom: 'Nour',
        role: 'RESPONSABLE_RH',
        initiales: 'NB',
        route: '/accueil-resp',
      })
    );

    component.email = 'rh@test.com';
    component.motDePasse = 'secret';
    component.onConnexion();

    expect(authConnexion).toHaveBeenCalledWith('rh@test.com', 'secret');
    expect(navigateSpy).toHaveBeenCalledWith(['/accueil-resp']);
  });

  it('shows error message on failed login', () => {
    authConnexion.mockReturnValue(throwError(() => new Error('Email ou mot de passe invalide.')));

    component.email = 'rh@test.com';
    component.motDePasse = 'wrong';
    component.onConnexion();

    expect(component.erreur).toBe('Email ou mot de passe invalide.');
  });
});
