import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CreateLeaveRequestDto } from '../absences-conges.models';
import { LeaveRequestService } from './leave-request.service';

describe('LeaveRequestService', () => {
  let service: LeaveRequestService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), LeaveRequestService],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(LeaveRequestService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('create sends POST with leave request body', () => {
    const dto: CreateLeaveRequestDto = {
      employeeId: 5,
      type: 'conge-paye',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      notes: 'Vacances',
    };

    service.create(dto).subscribe((request) => {
      expect(request.id).toBe(42);
      expect(request.status).toBe('pending');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/leave-requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({
      id: 42,
      employeeId: 5,
      type: 'conge-paye',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      requestedDays: 5,
      status: 'pending',
    });
  });

  it('updateStatus sends PATCH with status payload', () => {
    service.updateStatus(42, 'approved').subscribe((request) => {
      expect(request.status).toBe('approved');
    });

    const req = httpMock.expectOne('http://localhost:8080/api/leave-requests/42/status');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'approved', rejectionReason: undefined });
    req.flush({
      id: 42,
      employeeId: 5,
      type: 'conge-paye',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      requestedDays: 5,
      status: 'approved',
    });
  });
});
