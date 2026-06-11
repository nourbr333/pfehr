import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AttendanceService } from '../../services/attendance.service';
import { EmployeeService } from '../../services/employee.service';
import { DepartmentService } from '../../services/department.service';

import { EmployesComponent } from './employes';

describe('EmployesComponent', () => {
  let component: EmployesComponent;
  let fixture: ComponentFixture<EmployesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmployesComponent],
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
        {
          provide: EmployeeService,
          useValue: {
            getAllEmployees: () => of([]),
            getManagers: () => of([]),
          },
        },
        {
          provide: AttendanceService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: DepartmentService,
          useValue: {
            getAllDepartments: () => of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EmployesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
