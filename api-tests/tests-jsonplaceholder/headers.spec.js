const { test, expect } = require('@playwright/test');

// Verifica os headers de resposta de cada método HTTP.
// Asserções: Content-Type JSON com charset UTF-8 e CORS aberto (Access-Control-Allow-Origin: *).
// Os demais headers são registrados como anotação no relatório (para fixar valores depois).
const OBSERVE = ['cache-control', 'etag', 'vary', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-powered-by', 'content-length'];

const calls = [
  { method: 'GET', run: (r) => r.get('/posts/1'), status: 200 },
  { method: 'POST', run: (r) => r.post('/posts', { data: { title: 'h', body: 'h', userId: 1 } }), status: 201 },
  { method: 'PUT', run: (r) => r.put('/posts/1', { data: { id: 1, title: 'h', body: 'h', userId: 1 } }), status: 200 },
  { method: 'PATCH', run: (r) => r.patch('/posts/1', { data: { title: 'h' } }), status: 200 },
  { method: 'DELETE', run: (r) => r.delete('/posts/1'), status: 200 },
];

for (const { method, run, status } of calls) {
  test.describe(`${method} /posts › headers › positivos`, () => {
    test(`${method}: Content-Type JSON com charset UTF-8 e CORS aberto`, async ({ request }, testInfo) => {
      const res = await run(request);
      const h = res.headers();

      for (const name of OBSERVE) {
        if (h[name] !== undefined) testInfo.annotations.push({ type: `header ${name}`, description: h[name] });
      }

      expect(res.status()).toBe(status);
      expect(h['content-type']).toMatch(/^application\/json; charset=utf-8$/i);
      expect(h['access-control-allow-origin']).toBe('*');
    });
  });
}

test.describe('GET /posts › headers › negativos', () => {
  test('404 também responde JSON com charset UTF-8', async ({ request }) => {
    const res = await request.get('/posts/99999');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toMatch(/^application\/json; charset=utf-8$/i);
  });

  test('requisição com Accept incompatível não quebra a API', async ({ request }, testInfo) => {
    const res = await request.get('/posts/1', { headers: { Accept: 'application/xml' } });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    testInfo.annotations.push({ type: 'content-type observado', description: String(res.headers()['content-type']) });
    expect(res.status()).toBeLessThan(500);
  });
});
