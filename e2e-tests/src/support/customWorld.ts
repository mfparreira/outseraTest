import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { BrowserContext, Page } from '@playwright/test';

/** Estado de UM cenário. O Browser é compartilhado e fica em support/browser.ts. */
export interface CustomWorld extends World {
  context?: BrowserContext;
  page?: Page;
}

export class CustomWorldConstructor extends World implements CustomWorld {
  context?: BrowserContext;
  page?: Page;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(CustomWorldConstructor);
