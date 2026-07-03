import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

registerLocaleData(localePt, 'pt-BR');

bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection(), ...appConfig.providers]})
  .catch((err) => console.error(err));
