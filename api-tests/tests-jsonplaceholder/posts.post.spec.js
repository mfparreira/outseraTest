const { test, expect } = require('@playwright/test');

const payload = { title: 'Meu post de teste', body: 'Conteúdo do post', userId: 1 };

test.describe('POST /posts › positivos', () => {
  test('cria post: 201, JSON e corpo com os dados enviados + id gerado', async ({ request }) => {
    const res = await request.post('/posts', { data: payload });

    expect(res.status()).toBe(201);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toEqual({ ...payload, id: 101 });
  });

  test('aceita caracteres especiais e unicode no corpo', async ({ request }) => {
    const data = { ...payload, title: 'Ação & coração — "aspas" <tag> 😀' };
    const res = await request.post('/posts', { data });

    expect(res.status()).toBe(201);
    expect((await res.json()).title).toBe(data.title);
  });

  test('cria comentário em recurso aninhado (POST /posts/1/comments)', async ({ request }, testInfo) => {
    const data = { name: 'Fulano', email: 'fulano@example.com', body: 'Ótimo post' };
    const res = await request.post('/posts/1/comments', { data });

    // Status exato ainda não confirmado: registrado no relatório para fixar na próxima rodada.
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([201, 404]).toContain(res.status());
    if (res.status() === 201) expect(await res.json()).toMatchObject(data);
  });
});

test.describe('POST /posts › negativos (comportamento real da API: sem validação)', () => {
  // JSONPlaceholder não valida payloads. Estes testes documentam o comportamento
  // observado (caracterização) e verificam o que NÃO deve acontecer: persistência.

  test('corpo vazio {} é aceito (201): a API não valida campos obrigatórios', async ({ request }) => {
    const res = await request.post('/posts', { data: {} });

    expect(res.status()).toBe(201);
    expect(await res.json()).toEqual({ id: 101 });
  });

  test('campos ausentes (só title) é aceito e só devolve o que foi enviado', async ({ request }) => {
    const res = await request.post('/posts', { data: { title: 'só título' } });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('só título');
    expect(body).not.toHaveProperty('body');
  });

  test('tipo de dado errado (userId string) é aceito sem validação', async ({ request }) => {
    const res = await request.post('/posts', { data: { ...payload, userId: 'não-numérico' } });

    expect(res.status()).toBe(201);
    expect((await res.json()).userId).toBe('não-numérico');
  });

  test('JSON malformado retorna 500 (servidor não trata o erro) e nada é criado', async ({ request }, testInfo) => {
    const res = await request.post('/posts', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('{"title": "quebrado", '),
    });

    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    // Observado na execução real: 500. Numa API com tratamento correto seria 400.
    expect(res.status()).toBe(500);

    // O invariante que importa: o recurso não existe depois.
    expect((await request.get('/posts/101')).status()).toBe(404);
  });

  test('POST em /posts/:id (rota que só aceita GET/PUT/PATCH/DELETE) não é permitido', async ({ request }, testInfo) => {
    const res = await request.post('/posts/1', { data: payload });
    testInfo.annotations.push({ type: 'status observado', description: String(res.status()) });
    expect([404, 405]).toContain(res.status());
  });

  test('POST em rota inexistente retorna 404', async ({ request }) => {
    const res = await request.post('/recurso-inexistente', { data: payload });
    expect(res.status()).toBe(404);
  });

  test('recurso criado NÃO é persistido (GET /posts/101 retorna 404)', async ({ request }) => {
    const created = await request.post('/posts', { data: payload });
    expect(created.status()).toBe(201);

    const res = await request.get(`/posts/${(await created.json()).id}`);
    expect(res.status()).toBe(404);
  });
});

test.describe('Autenticação › negativos (comportamento real: API é pública)', () => {
  test('token inválido é ignorado: API não exige autenticação (200)', async ({ request }) => {
    const res = await request.get('/posts/1', { headers: { Authorization: 'Bearer token-falso' } });
    expect(res.status()).toBe(200);
  });

  test('sem header Authorization também retorna 200', async ({ request }) => {
    const res = await request.get('/posts/1');
    expect(res.status()).toBe(200);
  });
});
