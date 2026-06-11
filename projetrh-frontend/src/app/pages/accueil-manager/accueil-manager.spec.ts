import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth';
import { AttendanceService } from '../../services/attendance.service';
import { EmployeeService } from '../../services/employee.service';
import { EvaluationService } from '../../services/evaluation.service';
import { ManagerService } from '../../services/manager.service';
import { ManagerAdvancedAbsencesService } from '../../services/manager-advanced-absences.service';
import { ManagerOkrService } from '../../services/manager-okr.service';
import { WorkloadService } from '../../services/workload.service';

import { AccueilManagerComponent } from './accueil-manager';

describe('AccueilManagerComponent', () => {
  let component: AccueilManagerComponent;
  let fixture: ComponentFixture<AccueilManagerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccueilManagerComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            utilisateur: {
              email: 'manager@rh.com',
              nom: 'Ben Romdhane',
              prenom: 'Nour',
              role: 'Manager',
              initiales: 'NR',
              route: '/accueil-manager',
            },
            getCurrentUser() {
              return this.utilisateur;
            },
            getSsoToken: () => 'test-token',
            deconnexion: () => {},
          },
        },
        {
          provide: ManagerService,
          useValue: {
            resolveManagerEmployeeId: () => 9,
          },
        },
        {
          provide: EmployeeService,
          useValue: {
            getAllEmployees: () => of([]),
          },
        },
        {
          provide: AttendanceService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: WorkloadService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: EvaluationService,
          useValue: {
            listByEmployeeId: () => of([]),
          },
        },
        {
          provide: ManagerOkrService,
          useValue: {
            getDashboard: () => of({ objectives: [], milestones: [] }),
          },
        },
        {
          provide: ManagerAdvancedAbsencesService,
          useValue: {
            getDashboard: () => of(null),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccueilManagerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
