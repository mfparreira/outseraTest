import { defineConfig } from '@playwright/test';
import { config } from './src/support/config';

/** Suíte de acessibilidade (axe). Usa a mesma configuração central do E2E (URL, credenciais, navegador). */
export default defineConfig({
  testDir: './a11y',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: 0, // acessibilidade é determinística: sem retry para não mascarar violação
  timeout: 60_000,
  expect: { timeout: config.timeouts.expect },
  outputDir: 'reports/a11y/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/a11y/html', open: 'never' }],
    ['json', { outputFile: 'reports/a11y/results.json' }],
    ['junit', { outputFile: 'reports/a11y/junit.xml' }],
  ],
  use: {
    baseURL: config.baseUrl,
    viewport: config.browser.viewport,
    actionTimeout: config.timeouts.action,
    trace: 'retain-on-failure',
    // headless por padrão (a menos que E2E_HEADLESS=false seja pedido explicitamente)
    headless: process.env.E2E_HEADLESS === undefined ? true : config.browser.headless,
    launchOptions: { executablePath: config.browser.executablePath },
  },
});
