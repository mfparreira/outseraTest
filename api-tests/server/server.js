/**
 * API de exemplo (sem dependências) usada como alvo dos testes.
 *
 * Endpoints:
 *   POST   /api/auth/login      -> { token }
 *   GET    /api/users           -> lista (auth)
 *   POST   /api/users           -> cria  (auth)
 *   GET    /api/users/:id       -> busca (auth)
 *   PUT    /api/users/:id       -> atualiza (auth)
 *   DELETE /api/users/:id       -> remove (auth)
 *   GET    /api/health          -> status
 *   POST   /api/__reset         -> restaura dados iniciais (apenas para testes)
 */
const http = require('http');
const crypto = require('crypto');

const VALID_USER = { username: 'admin', password: 'admin123' };
const tokens = new Set();

let users;
let nextId;

function resetData() {
  users = [
    { id: 1, name: 'Ana Souza', email: 'ana@example.com', age: 28 },
    { id: 2, name: 'Bruno Lima', email: 'bruno@example.com', age: 35 },
  ];
  nextId = 3;
}
resetData();

function send(res, status, body, extraHeaders = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(status === 204 ? undefined : payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function isAuthenticated(req) {
  const h = req.headers['authorization'] || '';
  const [scheme, token] = h.split(' ');
  return scheme === 'Bearer' && tokens.has(token);
}

function validateUser(body, { partial = false } = {}) {
  const errors = [];
  const { name, email, age } = body;

  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || name.trim().length < 2) {
      errors.push({ field: 'name', message: 'name é obrigatório (mín. 2 caracteres)' });
    }
  }
  if (!partial || email !== undefined) {
    if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push({ field: 'email', message: 'email é obrigatório e deve ser válido' });
    }
  }
  if (age !== undefined) {
    if (!Number.isInteger(age) || age < 0 || age > 150) {
      errors.push({ field: 'age', message: 'age deve ser inteiro entre 0 e 150' });
    }
  }
  return errors;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  // ---------- health ----------
  if (path === '/api/health') {
    if (method !== 'GET') return send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET' });
    return send(res, 200, { status: 'ok' });
  }

  // ---------- reset (somente testes) ----------
  if (path === '/api/__reset') {
    if (method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
    resetData();
    return send(res, 200, { status: 'reset' });
  }

  // ---------- login ----------
  if (path === '/api/auth/login') {
    if (method !== 'POST') return send(res, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
    const raw = await readBody(req);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'JSON malformado' });
    }
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return send(res, 400, { error: 'username e password são obrigatórios' });
    }
    if (body.username !== VALID_USER.username || body.password !== VALID_USER.password) {
      return send(res, 401, { error: 'Credenciais inválidas' });
    }
    const token = crypto.randomBytes(16).toString('hex');
    tokens.add(token);
    return send(res, 200, { token, expiresIn: 3600 });
  }

  // ---------- users ----------
  const match = path.match(/^\/api\/users(?:\/([^/]+))?$/);
  if (match) {
    const idParam = match[1];
    const allowed = idParam ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];

    if (!allowed.includes(method)) {
      return send(res, 405, { error: 'Method Not Allowed' }, { Allow: allowed.join(', ') });
    }
    if (!isAuthenticated(req)) {
      return send(res, 401, { error: 'Não autenticado' }, { 'WWW-Authenticate': 'Bearer' });
    }

    // GET /api/users
    if (!idParam && method === 'GET') {
      return send(res, 200, { total: users.length, data: users });
    }

    // POST /api/users
    if (!idParam && method === 'POST') {
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('application/json')) {
        return send(res, 415, { error: 'Content-Type deve ser application/json' });
      }
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'JSON malformado' });
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return send(res, 400, { error: 'Corpo deve ser um objeto JSON' });
      }
      const errors = validateUser(body);
      if (errors.length) return send(res, 422, { error: 'Dados inválidos', details: errors });
      if (users.some((u) => u.email === body.email)) {
        return send(res, 409, { error: 'E-mail já cadastrado' });
      }
      const user = { id: nextId++, name: body.name.trim(), email: body.email, age: body.age };
      users.push(user);
      return send(res, 201, user, { Location: `/api/users/${user.id}` });
    }

    // /api/users/:id
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return send(res, 400, { error: 'ID inválido' });
    }
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) return send(res, 404, { error: 'Usuário não encontrado' });

    if (method === 'GET') return send(res, 200, users[index]);

    if (method === 'PUT') {
      const raw = await readBody(req);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: 'JSON malformado' });
      }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return send(res, 400, { error: 'Corpo deve ser um objeto JSON' });
      }
      const errors = validateUser(body);
      if (errors.length) return send(res, 422, { error: 'Dados inválidos', details: errors });
      if (users.some((u) => u.email === body.email && u.id !== id)) {
        return send(res, 409, { error: 'E-mail já cadastrado' });
      }
      users[index] = { id, name: body.name.trim(), email: body.email, age: body.age };
      return send(res, 200, users[index]);
    }

    if (method === 'DELETE') {
      users.splice(index, 1);
      return send(res, 204);
    }
  }

  return send(res, 404, { error: 'Rota não encontrada' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`API de exemplo em http://localhost:${PORT}`));
