import { Before, After } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import { CustomWorld } from './customWorld';
import * as fs from 'fs';
import * as path from 'path';

Before(async function (this: CustomWorld) {
  // Em CI (GitHub Actions define CI=true) não há tela, então roda headless.
  // Localmente continua abrindo o navegador; use HEADLESS=true para forçar headless.
  const headless = !!process.env.CI || process.env.HEADLESS === 'true';
  this.browser = await chromium.launch({ headless });
  this.context = await this.browser.newContext();
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld, scenario) {
  if (this.page) {
    const screenshotDir = path.join(process.cwd(), 'reports', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const fileName = `${scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    const screenshotPath = path.join(screenshotDir, fileName);
    
    const screenshot = await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.attach(screenshot, 'image/png');
  }

  await this.page?.close();
  await this.context?.close();
  await this.browser?.close();
});