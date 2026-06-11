import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuthService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('connexion stores token and user on success', () => {
    let userEmail = '';

    service.connexion('rh@test.com', 'secret').subscribe((user) => {
      userEmail = user.email;
    });

    const req = httpMock.expectOne('http://localhost:8080/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'rh@test.com', password: 'secret' });
    req.flush({
      token: 'jwt-token',
      email: 'rh@test.com',
      displayName: 'Nour Ben',
      role: 'RESPONSABLE_RH',
      route: '/accueil-resp',
      employeeId: 1,
      userId: 10,
    });

    expect(userEmail).toBe('rh@test.com');
    expect(service.getSsoToken()).toBe('jwt-token');
    expect(service.getCurrentUser()?.role).toBe('RESPONSABLE_RH');
  });

  it('deconnexion clears session and token', () => {
    localStorage.setItem('ssoToken', 'jwt-token');
    localStorage.setItem('currentUser', JSON.stringify({ email: 'a@b.com' }));

    service.deconnexion();

    expect(service.getCurrentUser()).toBeNull();
    expect(service.getSsoToken()).toBeNull();
    expect(localStorage.getItem('ssoToken')).toBeNull();
  });
});
