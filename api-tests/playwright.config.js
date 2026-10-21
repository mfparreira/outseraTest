// @ts-check
const { defineConfig } = require('@playwright/test');

const PORT = 3000;
// Para apontar para outra API: API_BASE_URL=https://minha-api.exemplo npx playwright test
const EXTERNAL = process.env.API_BASE_URL;
const BASE_URL = EXTERNAL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests',
  // Os testes compartilham o estado da API de exemplo; execução serial evita interferência.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  // A API de exemplo local só sobe quando nenhuma API externa foi configurada.
  webServer: EXTERNAL
    ? undefined
    : {
        command: 'node server/server.js',
        url: `${BASE_URL}/api/health`,
        reuseExistingServer: true,
        timeout: 10_000,
      },
});
