const { test, expect } = require('@playwright/test');
require('../contracts/matchers');

/** Contrato (JSON Schema/Ajv) em endpoints representativos do JSONPlaceholder. */
test.describe('Contrato › JSONPlaceholder', () => {
  test('GET /posts: todos os itens respeitam post.schema', async ({ request }) => {
    const body = await (await request.get('/posts')).json();
    expect(body.length).toBeGreaterThan(0);
    for (const p of body) expect(p).toMatchContract('post.schema.json');
  });

  test('GET /posts/1 respeita post.schema', async ({ request }) => {
    expect(await (await request.get('/posts/1')).json()).toMatchContract('post.schema.json');
  });

  test('GET /posts/1/comments: todos respeitam comment.schema e pertencem ao post 1', async ({ request }) => {
    const body = await (await request.get('/posts/1/comments')).json();
    expect(body.length).toBeGreaterThan(0);
    for (const c of body) {
      expect(c).toMatchContract('comment.schema.json');
      expect(c.postId).toBe(1);
    }
  });

  test('POST /posts: recurso criado respeita post.schema', async ({ request }) => {
    const res = await request.post('/posts', { data: { title: 'contrato', body: 'corpo', userId: 1 } });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchContract('post.schema.json');
  });

  test('PUT /posts/1: recurso atualizado respeita post.schema', async ({ request }) => {
    const res = await request.put('/posts/1', { data: { id: 1, title: 'novo', body: 'novo', userId: 1 } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchContract('post.schema.json');
  });
});
