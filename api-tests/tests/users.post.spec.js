const { test, expect } = require('@playwright/test');
const { config, resetData, getToken, authHeaders, validUser } = require('./helpers/api');

const { users } = config.paths;
let headers;

test.beforeAll(async ({ request }) => {
  await resetData(request);
  headers = authHeaders(await getToken(request));
});

test.describe('POST /users › positivos', () => {
  test('cria usuário: 201, Location e corpo com id gerado', async ({ request }) => {
    const payload = validUser();
    const res = await request.post(users, { headers, data: payload });

    expect(res.status()).toBe(201);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(body).toMatchObject(payload);
    expect(body.id).toEqual(expect.any(Number));
    expect(res.headers()['location']).toBe(`${users}/${body.id}`);
  });

  test('recurso criado pode ser recuperado via GET', async ({ request }) => {
    const created = await (await request.post(users, { headers, data: validUser() })).json();
    const res = await request.get(`${users}/${created.id}`, { headers });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  test('age é opcional', async ({ request }) => {
    const { age, ...semIdade } = validUser();
    const res = await request.post(users, { headers, data: semIdade });
    expect(res.status()).toBe(201);
  });
});

test.describe('POST /users › negativos', () => {
  test('campo name ausente retorna 422 com detalhe do campo', async ({ request }) => {
    const { name, ...payload } = validUser();
    const res = await request.post(users, { headers, data: payload });

    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.details.map((d) => d.field)).toContain('name');
  });

  test('campo email ausente retorna 422', async ({ request }) => {
    const { email, ...payload } = validUser();
    const res = await request.post(users, { headers, data: payload });

    expect(res.status()).toBe(422);
    expect((await res.json()).details.map((d) => d.field)).toContain('email');
  });

  test('corpo vazio retorna 422 listando todos os campos obrigatórios', async ({ request }) => {
    const res = await request.post(users, { headers, data: {} });

    expect(res.status()).toBe(422);
    const fields = (await res.json()).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email']));
  });

  test('e-mail em formato inválido retorna 422', async ({ request }) => {
    const res = await request.post(users, { headers, data: validUser({ email: 'sem-arroba' }) });
    expect(res.status()).toBe(422);
  });

  test('tipo de dado errado (age string) retorna 422', async ({ request }) => {
    const res = await request.post(users, { headers, data: validUser({ age: 'trinta' }) });
    expect(res.status()).toBe(422);
    expect((await res.json()).details.map((d) => d.field)).toContain('age');
  });

  test('age fora do intervalo retorna 422', async ({ request }) => {
    const res = await request.post(users, { headers, data: validUser({ age: -1 }) });
    expect(res.status()).toBe(422);
  });

  test('name curto demais retorna 422', async ({ request }) => {
    const res = await request.post(users, { headers, data: validUser({ name: 'A' }) });
    expect(res.status()).toBe(422);
  });

  test('e-mail duplicado retorna 409', async ({ request }) => {
    const payload = validUser();
    expect((await request.post(users, { headers, data: payload })).status()).toBe(201);

    const res = await request.post(users, { headers, data: payload });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/já cadastrado/i);
  });

  test('JSON malformado retorna 400', async ({ request }) => {
    const res = await request.post(users, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      // Buffer envia os bytes crus; uma string seria serializada pelo Playwright como JSON válido.
      data: Buffer.from('{"name": "Fulano", "email": '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/malformado/i);
  });

  test('corpo JSON que não é objeto (array) retorna 400', async ({ request }) => {
    const res = await request.post(users, { headers, data: [1, 2, 3] });
    expect(res.status()).toBe(400);
  });

  test('Content-Type não suportado retorna 415', async ({ request }) => {
    const res = await request.post(users, {
      headers: { ...headers, 'Content-Type': 'text/plain' },
      data: 'name=Fulano',
    });
    expect(res.status()).toBe(415);
  });

  test('sem autenticação retorna 401 e não cria o recurso', async ({ request }) => {
    const before = (await (await request.get(users, { headers })).json()).total;
    const res = await request.post(users, { data: validUser() });
    const after = (await (await request.get(users, { headers })).json()).total;

    expect(res.status()).toBe(401);
    expect(after).toBe(before);
  });
});
