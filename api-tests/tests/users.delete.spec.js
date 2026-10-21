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

test.describe('DELETE /users/:id › positivos', () => {
  test('remove usuário: 204 sem corpo', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.delete(`${users}/${created.id}`, { headers });

    expect(res.status()).toBe(204);
    expect(await res.text()).toBe('');
  });

  test('recurso removido retorna 404 no GET seguinte', async ({ request }) => {
    const created = await createUser(request);
    await request.delete(`${users}/${created.id}`, { headers });

    const res = await request.get(`${users}/${created.id}`, { headers });
    expect(res.status()).toBe(404);
  });

  test('total da lista diminui em 1 após remover', async ({ request }) => {
    const created = await createUser(request);
    const before = (await (await request.get(users, { headers })).json()).total;

    await request.delete(`${users}/${created.id}`, { headers });

    const after = (await (await request.get(users, { headers })).json()).total;
    expect(after).toBe(before - 1);
  });

  test('e-mail do usuário removido pode ser reutilizado', async ({ request }) => {
    const created = await createUser(request);
    await request.delete(`${users}/${created.id}`, { headers });

    const res = await request.post(users, {
      headers,
      data: { name: created.name, email: created.email, age: created.age },
    });
    expect(res.status()).toBe(201);
  });
});

test.describe('DELETE /users/:id › negativos', () => {
  test('ID inexistente retorna 404', async ({ request }) => {
    const res = await request.delete(`${users}/99999`, { headers });
    expect(res.status()).toBe(404);
  });

  test('segundo DELETE do mesmo recurso retorna 404', async ({ request }) => {
    const created = await createUser(request);
    expect((await request.delete(`${users}/${created.id}`, { headers })).status()).toBe(204);
    expect((await request.delete(`${users}/${created.id}`, { headers })).status()).toBe(404);
  });

  test('ID inválido retorna 400', async ({ request }) => {
    const res = await request.delete(`${users}/abc`, { headers });
    expect(res.status()).toBe(400);
  });

  test('sem autenticação retorna 401 e não remove o recurso', async ({ request }) => {
    const created = await createUser(request);
    const res = await request.delete(`${users}/${created.id}`);
    expect(res.status()).toBe(401);

    const still = await request.get(`${users}/${created.id}`, { headers });
    expect(still.status()).toBe(200);
  });

  test('token inválido retorna 401', async ({ request }) => {
    const res = await request.delete(`${users}/1`, { headers: { Authorization: 'Bearer falso' } });
    expect(res.status()).toBe(401);
  });
});
