import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth';

import { DepartementsComponent } from './departements';

describe('DepartementsComponent', () => {
  let component: DepartementsComponent;
  let fixture: ComponentFixture<DepartementsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DepartementsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            utilisateur: {
              email: 'admin@rh.com',
              nom: 'Ben Romdhane',
              prenom: 'Nour',
              role: 'Administrateur RH',
              initiales: 'NR',
              route: '/accueil-admin',
            },
            getCurrentUser() {
              return this.utilisateur;
            },
            getSsoToken: () => 'test-token',
            deconnexion: () => {},
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DepartementsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
