const { test, expect } = require('@playwright/test');
const { config, getToken } = require('./helpers/api');

const { login, users } = config.paths;

test.describe('POST /auth/login › positivos', () => {
  test('credenciais válidas retornam 200, JSON e token', async ({ request }) => {
    const res = await request.post(login, { data: config.credentials });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    const body = await res.json();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  test('token emitido dá acesso a rota protegida', async ({ request }) => {
    const token = await getToken(request);
    const res = await request.get(users, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(200);
  });
});

test.describe('POST /auth/login › negativos', () => {
  test('senha incorreta retorna 401', async ({ request }) => {
    const res = await request.post(login, {
      data: { username: config.credentials.username, password: 'errada' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toMatch(/inválidas/i);
  });

  test('usuário inexistente retorna 401', async ({ request }) => {
    const res = await request.post(login, { data: { username: 'ninguem', password: 'x' } });
    expect(res.status()).toBe(401);
  });

  test('campo password ausente retorna 400', async ({ request }) => {
    const res = await request.post(login, { data: { username: 'admin' } });
    expect(res.status()).toBe(400);
  });

  test('corpo vazio retorna 400', async ({ request }) => {
    const res = await request.post(login, { data: {} });
    expect(res.status()).toBe(400);
  });

  test('JSON malformado retorna 400', async ({ request }) => {
    const res = await request.post(login, {
      headers: { 'Content-Type': 'application/json' },
      // Buffer envia os bytes crus; uma string seria serializada pelo Playwright como JSON válido.
      data: Buffer.from('{"username": "admin", '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/malformado/i);
  });

  test('GET no endpoint de login retorna 405 com header Allow', async ({ request }) => {
    const res = await request.get(login);
    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
  });
});

test.describe('Autenticação em rota protegida › negativos', () => {
  test('sem header Authorization retorna 401 com WWW-Authenticate', async ({ request }) => {
    const res = await request.get(users);
    expect(res.status()).toBe(401);
    expect(res.headers()['www-authenticate']).toBe('Bearer');
  });

  test('token inválido retorna 401', async ({ request }) => {
    const res = await request.get(users, { headers: { Authorization: 'Bearer token-falso' } });
    expect(res.status()).toBe(401);
  });

  test('esquema incorreto (Basic) retorna 401', async ({ request }) => {
    const res = await request.get(users, { headers: { Authorization: 'Basic YWRtaW46YWRtaW4xMjM=' } });
    expect(res.status()).toBe(401);
  });

  test('Bearer sem token retorna 401', async ({ request }) => {
    const res = await request.get(users, { headers: { Authorization: 'Bearer ' } });
    expect(res.status()).toBe(401);
  });
});
