const { test, expect } = require('@playwright/test');

const isJson = (res) => expect(res.headers()['content-type']).toContain('application/json');

test.describe('GET /posts › positivos', () => {
  test('lista todos os posts: 200, JSON e estrutura', async ({ request }) => {
    const res = await request.get('/posts');

    expect(res.status()).toBe(200);
    isJson(res);
    const body = await res.json();
    expect(body).toHaveLength(100);
    for (const p of body) {
      expect(p).toEqual({
        userId: expect.any(Number),
        id: expect.any(Number),
        title: expect.any(String),
        body: expect.any(String),
      });
    }
  });

  test('busca post por ID: 200 e campos corretos', async ({ request }) => {
    const res = await request.get('/posts/1');

    expect(res.status()).toBe(200);
    isJson(res);
    expect(await res.json()).toMatchObject({ userId: 1, id: 1, title: expect.any(String), body: expect.any(String) });
  });

  test('filtro por query string (?userId=1) retorna só posts do usuário 1', async ({ request }) => {
    const res = await request.get('/posts', { params: { userId: 1 } });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((p) => p.userId === 1)).toBe(true);
  });

  test('filtro sem resultados retorna 200 e lista vazia', async ({ request }) => {
    const res = await request.get('/posts', { params: { userId: 99999 } });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('recurso aninhado: /posts/1/comments retorna comentários do post 1', async ({ request }) => {
    const res = await request.get('/posts/1/comments');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    for (const c of body) {
      expect(c.postId).toBe(1);
      expect(c.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    }
  });
});

test.describe('GET outros recursos › positivos', () => {
  const resources = [
    { path: '/users', total: 10, keys: ['id', 'name', 'username', 'email'] },
    { path: '/comments', total: 500, keys: ['postId', 'id', 'name', 'email', 'body'] },
    { path: '/albums', total: 100, keys: ['userId', 'id', 'title'] },
    { path: '/todos', total: 200, keys: ['userId', 'id', 'title', 'completed'] },
  ];

  for (const { path, total, keys } of resources) {
    test(`GET ${path}: 200, ${total} itens e campos esperados`, async ({ request }) => {
      const res = await request.get(path);

      expect(res.status()).toBe(200);
      isJson(res);
      const body = await res.json();
      expect(body).toHaveLength(total);
      expect(Object.keys(body[0])).toEqual(expect.arrayContaining(keys));
    });
  }

  test('GET /users/1: objeto com endereço e empresa aninhados', async ({ request }) => {
    const res = await request.get('/users/1');

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      id: 1,
      address: { geo: { lat: expect.any(String), lng: expect.any(String) } },
      company: { name: expect.any(String) },
    });
  });

  test('GET /todos/1: campo completed é booleano', async ({ request }) => {
    const body = await (await request.get('/todos/1')).json();
    expect(typeof body.completed).toBe('boolean');
  });
});

test.describe('GET › negativos', () => {
  test('ID inexistente retorna 404', async ({ request }) => {
    const res = await request.get('/posts/99999');
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({});
  });

  test('ID não numérico retorna 404', async ({ request }) => {
    const res = await request.get('/posts/abc');
    expect(res.status()).toBe(404);
  });

  test('ID zero retorna 404', async ({ request }) => {
    const res = await request.get('/posts/0');
    expect(res.status()).toBe(404);
  });

  test('recurso inexistente retorna 404', async ({ request }) => {
    const res = await request.get('/recurso-inexistente');
    expect(res.status()).toBe(404);
  });

  test('recurso aninhado de post inexistente retorna lista vazia', async ({ request }) => {
    const res = await request.get('/posts/99999/comments');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
