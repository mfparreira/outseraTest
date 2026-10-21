// @ts-check
const { defineConfig } = require('@playwright/test');

// Padrão: JSONPlaceholder real. Use API_BASE_URL para apontar para outro host.
const BASE_URL = process.env.API_BASE_URL || 'https://jsonplaceholder.typicode.com';

module.exports = defineConfig({
  testDir: './tests-jsonplaceholder',
  fullyParallel: true,
  workers: 2,
  retries: 1, // rede real: tolera uma falha transitória
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports-jsonplaceholder/html', open: 'never' }],
    ['json', { outputFile: 'reports-jsonplaceholder/results.json' }],
    ['junit', { outputFile: 'reports-jsonplaceholder/junit.xml' }],
  ],
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
});
