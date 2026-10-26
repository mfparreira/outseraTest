import { defineConfig } from 'cypress';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuração central. Nenhuma URL ou credencial fica nos testes:
 * tudo vem de variáveis de ambiente (as mesmas do E2E Playwright/Cucumber).
 */
const env = (name: string, fallback: string) => (process.env[name] ? (process.env[name] as string) : fallback);

export default defineConfig({
  e2e: {
    baseUrl: env('E2E_BASE_URL', 'https://www.saucedemo.com').replace(/\/+$/, ''),
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    viewportWidth: Number(env('E2E_VIEWPORT_WIDTH', '1280')),
    viewportHeight: Number(env('E2E_VIEWPORT_HEIGHT', '720')),
    defaultCommandTimeout: Number(env('E2E_ACTION_TIMEOUT_MS', '10000')),
    retries: { runMode: Number(env('CYPRESS_RETRIES', '1')), openMode: 0 },
    video: false,
    screenshotOnRunFailure: true,
    screenshotsFolder: 'reports/screenshots',
    // junit: um XML por spec (o CI publica e o relatório consolidado lê o resumo abaixo)
    reporter: 'junit',
    reporterOptions: { mochaFile: 'reports/junit/results-[hash].xml', toConsole: false },
    env: {
      standardUser: env('E2E_STANDARD_USER', 'standard_user'),
      lockedUser: env('E2E_LOCKED_USER', 'locked_out_user'),
      password: env('E2E_PASSWORD', 'secret_sauce'),
    },
    setupNodeEvents(on) {
      // Resumo em JSON no fim da execução (usado pelo relatório consolidado do pipeline)
      on('after:run', (results) => {
        if (!('totalTests' in results)) return;
        const r = results as CypressCommandLine.CypressRunResult;
        const summary = {
          browser: `${r.browserName} ${r.browserVersion}`,
          total: r.totalTests,
          passed: r.totalPassed,
          failed: r.totalFailed,
          skipped: r.totalSkipped + r.totalPending,
          durationMs: r.totalDuration,
          specs: r.runs.map((run) => ({
            spec: run.spec.relative,
            tests: run.tests.map((t) => ({
              title: t.title.join(' › '),
              state: t.state,
              durationMs: t.duration,
              error: t.displayError ? t.displayError.split('\n')[0] : undefined,
            })),
          })),
        };
        fs.mkdirSync('reports', { recursive: true });
        fs.writeFileSync(path.join('reports', 'cypress-summary.json'), JSON.stringify(summary, null, 2));
      });
    },
  },
});
