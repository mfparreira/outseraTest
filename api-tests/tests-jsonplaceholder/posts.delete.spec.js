const { test, expect } = require('@playwright/test');

test.describe('DELETE /posts/:id › positivos', () => {
  test('remove post: 200, JSON e corpo vazio {}', async ({ request }) => {
    const res = await request.delete('/posts/1');

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toEqual({});
  });

  test('DELETE é idempotente: repetir devolve o mesmo resultado', async ({ request }) => {
    const first = await request.delete('/posts/2');
    const second = await request.delete('/posts/2');

    expect(second.status()).toBe(first.status());
    expect(await second.json()).toEqual(await first.json());
  });

  test('DELETE em recurso de outro tipo (/comments/1) também funciona', async ({ request }) => {
    const res = await request.delete('/comments/1');
    expect(res.status()).toBe(200);
  });
});

test.describe('DELETE /posts/:id › negativos', () => {
  test('DELETE na coleção (/posts) não é permitido', async ({ request }, testInfo) => {
    const res = await request.delete('/posts');
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([404, 405]).toContain(res.status());
  });

  test('rota inexistente retorna 404', async ({ request }) => {
    const res = await request.delete('/recurso-inexistente/1');
    expect(res.status()).toBe(404);
  });

  test('remoção NÃO é persistida: o post continua existindo (GET retorna 200)', async ({ request }) => {
    await request.delete('/posts/3');
    const res = await request.get('/posts/3');
    expect(res.status()).toBe(200);
  });

  test('ID inexistente retorna 200 (não sinaliza que o recurso não existia) e não afeta a API', async ({ request }, testInfo) => {
    const res = await request.delete('/posts/99999');

    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    // Observado na execução real: 200. Muitas APIs responderiam 404 aqui.
    expect(res.status()).toBe(200);
    expect((await request.get('/posts/1')).status()).toBe(200);
  });
});
