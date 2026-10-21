const { test, expect } = require('@playwright/test');
const { config, resetData, getToken, authHeaders, validUser } = require('./helpers/api');

const { users } = config.paths;
let headers;

test.beforeAll(async ({ request }) => {
  await resetData(request);
  headers = authHeaders(await getToken(request));
});

async function createUser(request) {
  return (await request.post(users, { headers, data: validUser() })).json();
}

test.describe('PUT /users/:id › positivos', () => {
  test('atualiza usuário: 200, headers e corpo refletem a mudança', async ({ request }) => {
    const created = await createUser(request);
    const update = validUser({ name: 'Nome Atualizado', age: 41 });

    const res = await request.put(`${users}/${created.id}`, { headers, data: update });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toEqual({ id: created.id, ...update });
  });

  test('alteração é persistida (GET após PUT)', async ({ request }) => {
    const created = await createUser(request);
    const update = validUser({ name: 'Persistido' });
    await request.put(`${users}/${created.id}`, { headers, data: update });

    const res = await request.get(`${users}/${created.id}`, { headers });
    expect(await res.json()).toMatchObject({ name: 'Persistido', email: update.email });
  });

  test('PUT é idempotente: repetir a mesma requisição dá o mesmo resultado', async ({ request }) => {
    const created = await createUser(request);
    const update = validUser({ name: 'Idempotente' });

    const first = await (await request.put(`${users}/${created.id}`, { headers, data: update })).json();
    const secondRes = await request.put(`${users}/${created.id}`, { headers, data: update });

    expect(secondRes.status()).toBe(200);
    expect(await secondRes.json()).toEqual(first);
  });

  test('mantém o próprio e-mail sem gerar conflito', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.put(`${users}/${created.id}`, {
      headers,
      data: { name: 'Mesmo Email', email: created.email, age: created.age },
    });
    expect(res.status()).toBe(200);
  });
});

test.describe('PUT /users/:id › negativos', () => {
  test('ID inexistente retorna 404', async ({ request }) => {
    const res = await request.put(`${users}/99999`, { headers, data: validUser() });
    expect(res.status()).toBe(404);
  });

  test('ID inválido retorna 400', async ({ request }) => {
    const res = await request.put(`${users}/abc`, { headers, data: validUser() });
    expect(res.status()).toBe(400);
  });

  test('campos obrigatórios ausentes retornam 422', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.put(`${users}/${created.id}`, { headers, data: { age: 20 } });

    expect(res.status()).toBe(422);
    const fields = (await res.json()).details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email']));
  });

  test('e-mail inválido retorna 422 e não altera o recurso', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.put(`${users}/${created.id}`, {
      headers,
      data: validUser({ email: 'invalido' }),
    });
    expect(res.status()).toBe(422);

    const after = await (await request.get(`${users}/${created.id}`, { headers })).json();
    expect(after).toEqual(created);
  });

  test('e-mail de outro usuário retorna 409', async ({ request }) => {
    const a = await createUser(request);
    const b = await createUser(request);
    const res = await request.put(`${users}/${b.id}`, {
      headers,
      data: { name: b.name, email: a.email, age: b.age },
    });
    expect(res.status()).toBe(409);
  });

  test('JSON malformado retorna 400', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.put(`${users}/${created.id}`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      // Buffer envia os bytes crus; uma string seria serializada pelo Playwright como JSON válido.
      data: Buffer.from('{"name": '),
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/malformado/i);
  });

  test('sem autenticação retorna 401', async ({ request }) => {
    const res = await request.put(`${users}/1`, { data: validUser() });
    expect(res.status()).toBe(401);
  });
});
