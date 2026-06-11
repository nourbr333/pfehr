import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EmployeeService } from './employee.service';

describe('EmployeeService', () => {
  let service: EmployeeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), EmployeeService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EmployeeService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getAllEmployees calls the employees endpoint with unpaged flag', () => {
    service.getAllEmployees().subscribe((employees) => {
      expect(employees.length).toBe(1);
      expect(employees[0].firstName).toBe('Nour');
    });

    const req = httpMock.expectOne((r) => r.url === 'http://localhost:8080/api/employees' && r.params.get('unpaged') === 'true');
    expect(req.request.method).toBe('GET');
    req.flush({
      content: [
        {
          employeeId: 1,
          firstName: 'Nour',
          lastName: 'Ben',
          gender: 'F',
          jobTitle: 'RH',
          hireDate: '2024-01-01',
          maritalStatus: 'single',
          departmentId: 1,
          departmentName: 'RH',
        },
      ],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 1,
    });
  });

  it('updateEmployee sends a PUT request with payload', () => {
    service.updateEmployee(1, { jobTitle: 'Manager RH' }).subscribe((employee) => {
      expect(employee.jobTitle).toBe('Manager RH');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/employees/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ jobTitle: 'Manager RH' });
    req.flush({
      employeeId: 1,
      firstName: 'Nour',
      lastName: 'Ben',
      gender: 'F',
      jobTitle: 'Manager RH',
      hireDate: '2024-01-01',
      maritalStatus: 'single',
      departmentId: 1,
      departmentName: 'RH',
    });
  });
});
