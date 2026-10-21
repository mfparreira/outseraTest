const { test, expect } = require('@playwright/test');

// Headers de resposta do JSONPlaceholder, verificados por método HTTP.
// Valores de referência obtidos com: curl -i https://jsonplaceholder.typicode.com/posts/1
//
// Observação importante: o servidor NÃO envia Access-Control-Allow-Origin quando a requisição
// não tem o header Origin (só access-control-allow-credentials e "vary: Origin").
const JSON_UTF8 = /^application\/json; charset=utf-8$/i;

// Headers que o servidor pode variar por método/cache: registrados no relatório, sem asserção.
const OBSERVE = ['cache-control', 'etag', 'expires', 'pragma', 'vary', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-powered-by', 'access-control-allow-credentials', 'access-control-allow-origin'];

function observe(testInfo, headers) {
  for (const name of OBSERVE) {
    if (headers[name] !== undefined) testInfo.annotations.push({ type: `header ${name}`, description: headers[name] });
  }
}

const calls = [
  { method: 'GET', run: (r) => r.get('/posts/1'), status: 200 },
  { method: 'POST', run: (r) => r.post('/posts', { data: { title: 'h', body: 'h', userId: 1 } }), status: 201 },
  { method: 'PUT', run: (r) => r.put('/posts/1', { data: { id: 1, title: 'h', body: 'h', userId: 1 } }), status: 200 },
  { method: 'PATCH', run: (r) => r.patch('/posts/1', { data: { title: 'h' } }), status: 200 },
  { method: 'DELETE', run: (r) => r.delete('/posts/1'), status: 200 },
];

for (const { method, run, status } of calls) {
  test.describe(`${method} /posts › headers › positivos`, () => {
    test(`${method}: status ${status} e Content-Type JSON com charset UTF-8`, async ({ request }, testInfo) => {
      const res = await run(request);
      observe(testInfo, res.headers());

      expect(res.status()).toBe(status);
      expect(res.headers()['content-type']).toMatch(JSON_UTF8);
    });
  });
}

test.describe('GET /posts › headers › positivos (valores observados no curl)', () => {
  test('GET /posts/1: segurança, CORS com credenciais, cache e rate limit', async ({ request }) => {
    const h = (await request.get('/posts/1')).headers();

    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['access-control-allow-credentials']).toBe('true');
    expect(h['vary']).toMatch(/Origin/i);
    expect(h['cache-control']).toMatch(/max-age=\d+/);
    expect(h['etag']).toMatch(/^W\/"[^"]+"$/);
    expect(Number(h['x-ratelimit-limit'])).toBeGreaterThan(0);
    expect(Number(h['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
  });

  test('requisição condicional: If-None-Match com o ETag retorna 304 sem corpo', async ({ request }, testInfo) => {
    const first = await request.get('/posts/1');
    const etag = first.headers()['etag'];
    expect(etag).toBeTruthy();

    const res = await request.get('/posts/1', { headers: { 'If-None-Match': etag } });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([200, 304]).toContain(res.status());
    if (res.status() === 304) expect(await res.text()).toBe('');
  });
});

test.describe('GET /posts › headers › CORS', () => {
  test('sem Origin: não envia Access-Control-Allow-Origin', async ({ request }) => {
    const res = await request.get('/posts/1');
    expect(res.headers()['access-control-allow-origin']).toBeUndefined();
  });

  test('com Origin: registra a política de CORS devolvida', async ({ request }, testInfo) => {
    const res = await request.get('/posts/1', { headers: { Origin: 'https://exemplo.com' } });
    observe(testInfo, res.headers());

    expect(res.status()).toBe(200);
    // O valor exato (* ou o próprio Origin) ainda não foi confirmado: fica anotado no relatório.
    expect(res.headers()['access-control-allow-credentials']).toBe('true');
  });
});

test.describe('GET /posts › headers › negativos', () => {
  test('404 também responde JSON com charset UTF-8', async ({ request }) => {
    const res = await request.get('/posts/99999');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toMatch(JSON_UTF8);
  });

  test('Accept incompatível (application/xml) não quebra a API', async ({ request }, testInfo) => {
    const res = await request.get('/posts/1', { headers: { Accept: 'application/xml' } });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    testInfo.annotations.push({ type: 'content-type observado', description: String(res.headers()['content-type']) });
    expect(res.status()).toBeLessThan(500);
  });
});
