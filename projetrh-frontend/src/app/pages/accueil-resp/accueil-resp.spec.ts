import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AccueilRespComponent } from './accueil-resp-page';

describe('AccueilRespComponent', () => {
  let component: AccueilRespComponent;
  let fixture: ComponentFixture<AccueilRespComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccueilRespComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AccueilRespComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
