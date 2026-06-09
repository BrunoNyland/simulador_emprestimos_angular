import { Routes } from '@angular/router';
import { SimuladorComponent } from './features/simulacao/simulador.component';

export const routes: Routes = [
  { path: '', component: SimuladorComponent },
  { path: '**', redirectTo: '' },
];
