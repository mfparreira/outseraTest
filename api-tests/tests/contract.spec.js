const { test, expect } = require('@playwright/test');
require('../contracts/matchers');
const { violations } = require('../contracts');
const { config, resetData, getToken, authHeaders, validUser } = require('./helpers/api');

/**
 * Contrato (JSON Schema/Ajv) em endpoints representativos da API local.
 * Complementa os testes funcionais: aqui o foco é o FORMATO da resposta (tipos, campos obrigatórios,
 * ausência de campos inesperados), inclusive nas respostas de erro.
 */
const { users, login } = config.paths;
let headers;

test.beforeAll(async ({ request }) => {
  await resetData(request);
  headers = authHeaders(await getToken(request));
});

test.describe('Contrato › respostas de sucesso', () => {
  test('POST /auth/login respeita login-response', async ({ request }) => {
    const res = await request.post(login, { data: config.credentials });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchContract('login-response.schema.json');
  });

  test('GET /users respeita user-list (e total == data.length)', async ({ request }) => {
    const body = await (await request.get(users, { headers })).json();
    expect(body).toMatchContract('user-list.schema.json');
    expect(body.total).toBe(body.data.length);
  });

  test('GET /users/:id respeita user', async ({ request }) => {
    const res = await request.get(`${users}/1`, { headers });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchContract('user.schema.json');
  });

  test('POST /users (201) respeita user e Location aponta para o recurso criado', async ({ request }) => {
    const res = await request.post(users, { headers, data: validUser() });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchContract('user.schema.json');
    expect(res.headers()['location']).toBe(`${users}/${body.id}`);
  });

  test('PUT /users/:id respeita user', async ({ request }) => {
    const res = await request.put(`${users}/2`, { headers, data: validUser() });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchContract('user.schema.json');
  });
});

test.describe('Contrato › respostas de erro seguem o mesmo formato', () => {
  const cases = [
    ['422 (payload inválido)', (r) => r.post(users, { headers, data: { name: '' } })],
    ['401 (sem token)', (r) => r.get(users)],
    ['404 (id inexistente)', (r) => r.get(`${users}/999999`, { headers })],
    ['405 (método inválido)', (r) => r.patch(users, { headers, data: {} })],
  ];
  for (const [nome, call] of cases) {
    test(`${nome} respeita error.schema`, async ({ request }) => {
      const res = await call(request);
      expect(res.status()).toBe(Number(nome.slice(0, 3)));
      expect(res.headers()['content-type']).toContain('application/json');
      expect(await res.json()).toMatchContract('error.schema.json');
    });
  }
});

test.describe('Contrato › o próprio validador detecta quebras (controle negativo)', () => {
  const valido = { id: 1, name: 'Ana', email: 'ana@example.com', age: 30 };

  test('campo obrigatório ausente', () => {
    const { age, ...semIdade } = valido;
    expect(violations('user.schema.json', semIdade).join()).toContain("must have required property 'age'");
  });
  test('tipo errado (id string)', () => {
    expect(violations('user.schema.json', { ...valido, id: '1' }).join()).toContain('/id must be integer');
  });
  test('formato inválido (e-mail)', () => {
    expect(violations('user.schema.json', { ...valido, email: 'nao-e-email' }).join()).toContain('format');
  });
  test('campo inesperado (vazamento de dado, ex.: senha)', () => {
    expect(violations('user.schema.json', { ...valido, password: 'x' }).join()).toContain('"password"');
  });
});
