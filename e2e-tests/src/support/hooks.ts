import { After, AfterAll, Before, BeforeAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { closeBrowser, getBrowser, launchBrowser } from './browser';
import { config } from './config';
import { CustomWorld } from './customWorld';

setDefaultTimeout(config.timeouts.step);

// ---------------------------------------------------------------- ciclo de vida da suíte
BeforeAll(async function () {
  expect.configure({ timeout: config.timeouts.expect }); // espera automática das assertions
  fs.mkdirSync(config.paths.screenshots, { recursive: true });
  fs.mkdirSync(config.paths.traces, { recursive: true });
  await launchBrowser(); // 1 Browser para todos os cenários
});

AfterAll(async function () {
  await closeBrowser();
});

// ---------------------------------------------------------------- ciclo de vida do cenário
Before(async function (this: CustomWorld) {
  // 1 BrowserContext novo por cenário: isolamento completo sem o custo de abrir outro navegador
  this.context = await getBrowser().newContext({
    baseURL: config.baseUrl, // as páginas navegam por caminho relativo
    viewport: config.browser.viewport,
  });
  this.context.setDefaultTimeout(config.timeouts.action);

  if (config.evidence.trace !== 'off') {
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  }
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld, scenario) {
  const failed = scenario.result?.status === Status.FAILED;
  const slug = `${scenario.pickle.name.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80)}_${scenario.pickle.id.slice(0, 8)}`;

  // Screenshot (padrão: todos os cenários, como evidência; configurável por E2E_SCREENSHOT)
  if (this.page && (config.evidence.screenshot === 'always' || (config.evidence.screenshot === 'on-failure' && failed))) {
    const shot = await this.page.screenshot({ path: path.join(config.paths.screenshots, `${slug}.png`), fullPage: true });
    this.attach(shot, 'image/png');
  }

  // Trace do Playwright: gravado durante o cenário, mas só salvo em falha (ou sempre, se E2E_TRACE=always).
  // Em cenário aprovado o trace é descartado, sem custo de disco.
  if (config.evidence.trace !== 'off') {
    if (failed || config.evidence.trace === 'always') {
      const tracePath = path.join(config.paths.traces, `${slug}.zip`);
      await this.context?.tracing.stop({ path: tracePath });
      this.attach(`Trace do Playwright: reports/traces/${path.basename(tracePath)}\nAbrir com: npx playwright show-trace "reports/traces/${path.basename(tracePath)}"`, 'text/plain');
    } else {
      await this.context?.tracing.stop();
    }
  }

  await this.context?.close(); // fecha só o contexto; o Browser continua para o próximo cenário
});
