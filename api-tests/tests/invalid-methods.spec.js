const { test, expect } = require('@playwright/test');
const { config, resetData, getToken, authHeaders } = require('./helpers/api');

const { users } = config.paths;
let headers;

test.beforeAll(async ({ request }) => {
  await resetData(request);
  headers = authHeaders(await getToken(request));
});

test.describe('Métodos HTTP inválidos › negativos', () => {
  // Coleção /users aceita apenas GET e POST
  for (const method of ['put', 'delete', 'patch']) {
    test(`${method.toUpperCase()} na coleção /users retorna 405 com Allow: GET, POST`, async ({ request }) => {
      const res = await request[method](users, { headers, data: {} });

      expect(res.status()).toBe(405);
      expect(res.headers()['allow']).toBe('GET, POST');
      expect((await res.json()).error).toMatch(/method not allowed/i);
    });
  }

  // Recurso /users/:id aceita apenas GET, PUT e DELETE
  for (const method of ['post', 'patch']) {
    test(`${method.toUpperCase()} em /users/:id retorna 405 com Allow: GET, PUT, DELETE`, async ({ request }) => {
      const res = await request[method](`${users}/1`, { headers, data: {} });

      expect(res.status()).toBe(405);
      expect(res.headers()['allow']).toBe('GET, PUT, DELETE');
    });
  }

  test('método inválido não altera dados (PATCH em /users/1)', async ({ request }) => {
    await request.patch(`${users}/1`, { headers, data: { name: 'Hack' } });
    const res = await request.get(`${users}/1`, { headers });
    expect((await res.json()).name).toBe('Ana Souza');
  });

  test('POST em /health retorna 405', async ({ request }) => {
    const res = await request.post('/api/health');
    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('GET');
  });
});

test.describe('Health check › positivos', () => {
  test('GET /health retorna 200 e status ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
