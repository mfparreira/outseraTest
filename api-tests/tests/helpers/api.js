// Configuração central: para testar outra API, ajuste aqui (ou use variáveis de ambiente).
const config = {
  paths: {
    login: process.env.PATH_LOGIN || '/api/auth/login',
    users: process.env.PATH_USERS || '/api/users',
    reset: process.env.PATH_RESET || '/api/__reset',
  },
  credentials: {
    username: process.env.API_USER || 'admin',
    password: process.env.API_PASS || 'admin123',
  },
};

/** Restaura os dados iniciais da API de exemplo (endpoint só existe no mock local). */
async function resetData(request) {
  const res = await request.post(config.paths.reset);
  if (!res.ok()) throw new Error(`Falha ao resetar dados: ${res.status()}`);
}

/** Faz login e devolve o token Bearer. */
async function getToken(request) {
  const res = await request.post(config.paths.login, { data: config.credentials });
  if (!res.ok()) throw new Error(`Falha no login: ${res.status()}`);
  return (await res.json()).token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Payload válido, com e-mail único por chamada para evitar conflito (409). */
let seq = 0;
function validUser(overrides = {}) {
  seq += 1;
  return {
    name: 'Carla Mendes',
    email: `carla.${Date.now()}.${seq}@example.com`,
    age: 30,
    ...overrides,
  };
}

module.exports = { config, resetData, getToken, authHeaders, validUser };
