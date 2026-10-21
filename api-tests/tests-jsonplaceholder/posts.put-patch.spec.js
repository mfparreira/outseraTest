const { test, expect } = require('@playwright/test');

const full = { id: 1, title: 'título atualizado', body: 'corpo atualizado', userId: 1 };

test.describe('PUT /posts/:id › positivos', () => {
  test('substitui o recurso: 200, JSON e corpo com os valores enviados', async ({ request }) => {
    const res = await request.put('/posts/1', { data: full });

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toEqual(full);
  });

  test('PUT é idempotente: repetir devolve o mesmo resultado', async ({ request }) => {
    const first = await (await request.put('/posts/1', { data: full })).json();
    const secondRes = await request.put('/posts/1', { data: full });

    expect(secondRes.status()).toBe(200);
    expect(await secondRes.json()).toEqual(first);
  });

  test('o id da URL prevalece sobre o id do corpo', async ({ request }) => {
    const res = await request.put('/posts/2', { data: { ...full, id: 2 } });
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(2);
  });
});

test.describe('PUT /posts/:id › negativos', () => {
  test('ID inexistente retorna 500 (servidor falha em vez de responder 404)', async ({ request }, testInfo) => {
    const res = await request.put('/posts/99999', { data: { ...full, id: 99999 } });

    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    // Observado na execução real: 500. Numa API com tratamento correto seria 404.
    expect(res.status()).toBe(500);
  });

  test('PUT na coleção (/posts) não é permitido', async ({ request }, testInfo) => {
    const res = await request.put('/posts', { data: full });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([404, 405]).toContain(res.status());
  });

  test('corpo vazio é aceito (API não valida) e devolve apenas o id', async ({ request }) => {
    const res = await request.put('/posts/1', { data: {} });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ id: 1 });
  });

  test('JSON malformado retorna 500 (servidor não trata o erro) e o recurso não muda', async ({ request }, testInfo) => {
    const res = await request.put('/posts/1', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('{"title": '),
    });

    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    // Observado na execução real: 500. Numa API com tratamento correto seria 400.
    expect(res.status()).toBe(500);

    const after = await (await request.get('/posts/1')).json();
    expect(after.title).not.toBe(full.title);
  });

  test('alteração NÃO é persistida (GET seguinte mostra o valor original)', async ({ request }) => {
    await request.put('/posts/1', { data: full });
    const after = await (await request.get('/posts/1')).json();
    expect(after.title).not.toBe('título atualizado');
  });
});

test.describe('PATCH /posts/:id › positivos', () => {
  test('atualização parcial: 200, mescla campo enviado com o recurso existente', async ({ request }) => {
    const res = await request.patch('/posts/1', { data: { title: 'só o título mudou' } });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 1,
      userId: 1,
      title: 'só o título mudou',
      body: expect.any(String),
    });
  });
});
