import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth';
import { CalendarService } from '../../services/calendar.service';
import { EmployeeService } from '../../services/employee.service';
import { DepartmentService } from '../../services/department.service';

import { CalendrierComponent } from './calendrier';

describe('CalendrierComponent', () => {
  let component: CalendrierComponent;
  let fixture: ComponentFixture<CalendrierComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendrierComponent],
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
              employeeId: 1
            },
            getCurrentUser() {
              return this.utilisateur;
            },
            getSsoToken: () => 'test-token',
            deconnexion: () => {},
          },
        },
        {
          provide: CalendarService,
          useValue: {
            getVisibleEvents: () => of([]),
            addEvent: () => of({}),
            updateEvent: () => of({}),
            deleteEvent: () => of(undefined)
          }
        },
        {
          provide: EmployeeService,
          useValue: {
            getAllEmployees: () => of([])
          }
        },
        {
          provide: DepartmentService,
          useValue: {
            getAllDepartments: () => of([])
          }
        }
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendrierComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
