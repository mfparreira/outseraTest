const { test, expect } = require('@playwright/test');
const { config, resetData, getToken, authHeaders } = require('./helpers/api');

const { users } = config.paths;
let headers;

test.beforeAll(async ({ request }) => {
  await resetData(request);
  headers = authHeaders(await getToken(request));
});

test.describe('GET /users › positivos', () => {
  test('lista usuários: 200, headers e estrutura do corpo', async ({ request }) => {
    const res = await request.get(users, { headers });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');

    const body = await res.json();
    expect(body.total).toBe(body.data.length);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    for (const u of body.data) {
      expect(u).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: expect.any(String),
          email: expect.stringMatching(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
        })
      );
    }
  });

  test('busca usuário por ID existente', async ({ request }) => {
    const res = await request.get(`${users}/1`, { headers });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toMatchObject({ id: 1, name: 'Ana Souza', email: 'ana@example.com' });
  });
});

test.describe('GET /users › negativos', () => {
  test('ID inexistente retorna 404', async ({ request }) => {
    const res = await request.get(`${users}/99999`, { headers });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toMatch(/não encontrado/i);
  });

  test('ID não numérico retorna 400', async ({ request }) => {
    const res = await request.get(`${users}/abc`, { headers });
    expect(res.status()).toBe(400);
  });

  test('ID negativo retorna 400', async ({ request }) => {
    const res = await request.get(`${users}/-5`, { headers });
    expect(res.status()).toBe(400);
  });

  test('ID zero retorna 400', async ({ request }) => {
    const res = await request.get(`${users}/0`, { headers });
    expect(res.status()).toBe(400);
  });

  test('sem autenticação retorna 401', async ({ request }) => {
    const res = await request.get(`${users}/1`);
    expect(res.status()).toBe(401);
  });

  test('rota inexistente retorna 404', async ({ request }) => {
    const res = await request.get('/api/rota-que-nao-existe', { headers });
    expect(res.status()).toBe(404);
  });
});
