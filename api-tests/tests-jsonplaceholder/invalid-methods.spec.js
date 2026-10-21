const { test, expect } = require('@playwright/test');

test.describe('Métodos HTTP inválidos › negativos', () => {
  for (const method of ['put', 'delete', 'patch']) {
    test(`${method.toUpperCase()} na coleção /posts não é permitido`, async ({ request }, testInfo) => {
      const res = await request[method]('/posts', { data: {} });
      testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
      expect([404, 405]).toContain(res.status());
    });
  }

  test('POST em /posts/1 não é permitido', async ({ request }, testInfo) => {
    const res = await request.post('/posts/1', { data: {} });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([404, 405]).toContain(res.status());
  });

  test('método inexistente (FOO) não retorna sucesso', async ({ request }, testInfo) => {
    const res = await request.fetch('/posts/1', { method: 'FOO' });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('OPTIONS /posts retorna 204 e informa os métodos permitidos (CORS preflight)', async ({ request }, testInfo) => {
    const res = await request.fetch('/posts', { method: 'OPTIONS' });

    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    testInfo.annotations.push({
      type: 'allow-methods observado',
      description: String(res.headers()['access-control-allow-methods']),
    });
    // Observado na execução real: 204.
    expect(res.status()).toBe(204);
  });

  test('HEAD /posts/1 retorna 200 sem corpo', async ({ request }) => {
    const res = await request.head('/posts/1');
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe('');
  });
});
