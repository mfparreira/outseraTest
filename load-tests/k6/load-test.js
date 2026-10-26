/**
 * Teste de performance com k6, com dois perfis parametrizáveis:
 *
 *   PROFILE=smoke  validação rápida a cada commit: poucos usuários, thresholds rígidos
 *   PROFILE=load   carga: 500 usuários simultâneos por 5 minutos (padrão)
 *
 * Alvo padrão: API de mock do projeto (api-tests/server/server.js), em http://localhost:3000.
 *
 * Exemplos:
 *   k6 run -e PROFILE=smoke k6/load-test.js
 *   k6 run k6/load-test.js                                   # perfil load: 500 VUs, 5m
 *   k6 run -e VUS=200 -e HOLD=2m -e RAMP_UP=1m k6/load-test.js
 *   k6 run -e BASE_URL=https://minha-api.exemplo -e P95_MS=800 k6/load-test.js
 *
 * Parâmetros (-e NOME=valor). Todos sobrescrevem o padrão do perfil:
 *   BASE_URL     URL base da API
 *   VUS          usuários virtuais simultâneos no patamar
 *   RAMP_UP      tempo para subir de 0 até VUS
 *   HOLD         duração do patamar com VUS usuários
 *   RAMP_DOWN    tempo para descer a 0
 *   THINK_MIN / THINK_MAX   pausa entre ações, em segundos (simula usuário real)
 *   WRITE_RATIO  fração das iterações que fazem escrita (criar/atualizar/remover)
 *   P95_MS / P99_MS         limites de latência (ms) para p95 e p99
 *   MAX_ERROR_RATE          taxa máxima de requisições com falha (0.01 = 1%)
 *   MIN_RPS                 vazão mínima (requisições por segundo)
 *   REPORT_DIR              pasta de saída dos relatórios (padrão reports/<perfil>)
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { renderHtml } from './lib/report.js';

// ----------------------------------------------------------------- perfis
const PROFILES = {
  smoke: { VUS: 2, RAMP_UP: '10s', HOLD: '40s', RAMP_DOWN: '10s', P95_MS: 300, P99_MS: 600, MAX_ERROR_RATE: 0.005, MIN_RPS: 1 },
  load: { VUS: 500, RAMP_UP: '30s', HOLD: '5m', RAMP_DOWN: '30s', P95_MS: 500, P99_MS: 1000, MAX_ERROR_RATE: 0.01, MIN_RPS: 400 },
};

const PROFILE = __ENV.PROFILE || 'load';
if (!PROFILES[PROFILE]) throw new Error(`PROFILE inválido: "${PROFILE}". Use: ${Object.keys(PROFILES).join(', ')}`);
const base = PROFILES[PROFILE];
const pick = (name) => (__ENV[name] !== undefined ? __ENV[name] : base[name]);

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = Number(pick('VUS'));
const RAMP_UP = String(pick('RAMP_UP'));
const HOLD = String(pick('HOLD'));
const RAMP_DOWN = String(pick('RAMP_DOWN'));
const P95_MS = Number(pick('P95_MS'));
const P99_MS = Number(pick('P99_MS'));
const MAX_ERROR_RATE = Number(pick('MAX_ERROR_RATE'));
const MIN_RPS = Number(pick('MIN_RPS'));
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 3);
const WRITE_RATIO = Number(__ENV.WRITE_RATIO || 0.3);
const NEGATIVE_RATIO = Number(__ENV.NEGATIVE_RATIO || 0.1);
const REPORT_DIR = __ENV.REPORT_DIR || `reports/${PROFILE}`;

const CREDENTIALS = JSON.stringify({
  username: __ENV.API_USER || 'admin',
  password: __ENV.API_PASS || 'admin123',
});

// ----------------------------------------------------------------- métricas próprias
const businessErrors = new Rate('business_errors'); // status ok, mas conteúdo errado
const loginFailures = new Counter('login_failures');
const usersCreated = new Counter('users_created');
const journeyDuration = new Trend('journey_duration', true); // requisições de uma iteração (sem a pausa final)

// ----------------------------------------------------------------- opções
const WRITE_P95 = Math.round(P95_MS * 1.6); // escrita tolera latência maior que leitura
const GET_P95 = Math.round(P95_MS * 0.6); // leitura simples é mais rígida

const STAGES = [
  { duration: RAMP_UP, target: VUS },
  { duration: HOLD, target: VUS },
  { duration: RAMP_DOWN, target: 0 },
];

export const options = {
  scenarios: {
    usuarios: {
      executor: 'ramping-vus', // sobe, mantém e desce os usuários simultâneos
      startVUs: 0,
      stages: STAGES,
      gracefulRampDown: '30s',
    },
  },

  thresholds: {
    // Disponibilidade e erros
    http_req_failed: [
      `rate<${MAX_ERROR_RATE}`,
      { threshold: 'rate<0.30', abortOnFail: true, delayAbortEval: '1m' }, // trava de segurança se colapsar
    ],
    checks: ['rate>0.99'],
    business_errors: ['rate<0.01'],
    login_failures: ['count==0'],

    // Latência geral (p95 e p99)
    http_req_duration: [`p(95)<${P95_MS}`, `p(99)<${P99_MS}`],

    // Vazão (throughput)
    http_reqs: [`rate>${MIN_RPS}`],

    // Contagem por endpoint: threshold sempre verdadeiro, só para o k6 expor a sub-métrica http_reqs{endpoint:...}
    'http_reqs{endpoint:login}': ['count>=0'],
    'http_reqs{endpoint:list}': ['count>=0'],
    'http_reqs{endpoint:get}': ['count>=0'],
    'http_reqs{endpoint:create}': ['count>=0'],
    'http_reqs{endpoint:update}': ['count>=0'],
    'http_reqs{endpoint:delete}': ['count>=0'],

    // Latência por endpoint
    'http_req_duration{endpoint:login}': [`p(95)<${P95_MS}`],
    'http_req_duration{endpoint:list}': [`p(95)<${P95_MS}`],
    'http_req_duration{endpoint:get}': [`p(95)<${GET_P95}`],
    'http_req_duration{endpoint:create}': [`p(95)<${WRITE_P95}`],
    'http_req_duration{endpoint:update}': [`p(95)<${WRITE_P95}`],
    'http_req_duration{endpoint:delete}': [`p(95)<${WRITE_P95}`],
  },

  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ----------------------------------------------------------------- utilidades
let token; // por VU: cada usuário virtual faz login uma vez e reutiliza o token
const rand = (min, max) => min + Math.random() * (max - min);
const tags = (endpoint) => ({ endpoint, name: endpoint }); // "name" fixo evita cardinalidade alta

function login() {
  const res = http.post(`${BASE_URL}/api/auth/login`, CREDENTIALS, {
    headers: { 'Content-Type': 'application/json' },
    tags: tags('login'),
  });
  const ok = check(res, {
    'login: status 200': (r) => r.status === 200,
    'login: retorna token': (r) => !!r.json('token'),
  });
  if (!ok) {
    loginFailures.add(1);
    return null;
  }
  return res.json('token');
}

function parse(res, path) {
  try {
    // res.json(undefined) não devolve o corpo inteiro no k6: sem caminho, chama sem argumento
    return path === undefined ? res.json() : res.json(path);
  } catch (e) {
    return undefined;
  }
}

// ----------------------------------------------------------------- jornada do usuário
export default function () {
  const started = Date.now();

  if (!token) token = login();
  if (!token) {
    sleep(1);
    return;
  }
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1) Leitura (toda iteração)
  group('leitura', () => {
    const list = http.get(`${BASE_URL}/api/users`, { headers, tags: tags('list') });
    businessErrors.add(
      !check(list, {
        'list: status 200': (r) => r.status === 200,
        'list: corpo coerente (total == data.length)': (r) => {
          const body = parse(r);
          return body !== undefined && Array.isArray(body.data) && body.total === body.data.length;
        },
      })
    );

    const one = http.get(`${BASE_URL}/api/users/1`, { headers, tags: tags('get') });
    businessErrors.add(
      !check(one, {
        'get: status 200': (r) => r.status === 200,
        'get: id == 1': (r) => parse(r, 'id') === 1,
      })
    );
  });

  // 2) Escrita (parte das iterações): cria -> atualiza -> remove (mantém o volume de dados estável)
  if (Math.random() < WRITE_RATIO) {
    group('escrita', () => {
      const email = `vu${__VU}.it${__ITER}.${Date.now()}@load.test`;

      const created = http.post(`${BASE_URL}/api/users`, JSON.stringify({ name: 'Usuario Carga', email, age: 30 }), {
        headers,
        tags: tags('create'),
      });
      const id = parse(created, 'id');
      const okCreate = check(created, {
        'create: status 201': (r) => r.status === 201,
        'create: retorna id numérico': () => typeof id === 'number',
      });
      businessErrors.add(!okCreate);
      if (!okCreate) return;
      usersCreated.add(1);

      const updated = http.put(`${BASE_URL}/api/users/${id}`, JSON.stringify({ name: 'Nome Atualizado', email, age: 31 }), {
        headers,
        tags: tags('update'),
      });
      businessErrors.add(
        !check(updated, {
          'update: status 200': (r) => r.status === 200,
          'update: nome atualizado': (r) => parse(r, 'name') === 'Nome Atualizado',
        })
      );

      const removed = http.del(`${BASE_URL}/api/users/${id}`, null, { headers, tags: tags('delete') });
      businessErrors.add(!check(removed, { 'delete: status 204': (r) => r.status === 204 }));
    });
  }

  // 3) Cenários negativos: 404 e 401 são respostas ESPERADAS (não contam como falha de disponibilidade)
  if (Math.random() < NEGATIVE_RATIO) {
    group('negativos', () => {
      const missing = http.get(`${BASE_URL}/api/users/99999999`, {
        headers,
        tags: tags('get_404'),
        responseCallback: http.expectedStatuses(404),
      });
      businessErrors.add(!check(missing, { 'inexistente: status 404': (r) => r.status === 404 }));

      const anon = http.get(`${BASE_URL}/api/users`, {
        tags: tags('list_sem_token'),
        responseCallback: http.expectedStatuses(401),
      });
      businessErrors.add(!check(anon, { 'sem token: status 401': (r) => r.status === 401 }));
    });
  }

  journeyDuration.add(Date.now() - started);
  sleep(rand(THINK_MIN, THINK_MAX));
}

// ----------------------------------------------------------------- relatório ao final
const num = (v, d = 2) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '-');
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const ENDPOINTS = ['login', 'list', 'get', 'create', 'update', 'delete', 'get_404', 'list_sem_token'];

function thresholdsOf(metric) {
  return Object.entries(metric.thresholds || {})
    .filter(([expr]) => expr !== 'count>=0') // auxiliares (só criam sub-métricas de contagem)
    .map(([expr, t]) => ({ expr, ok: typeof t === 'object' ? !!t.ok : !t }));
}

function buildText(data, allOk) {
  const m = data.metrics;
  const v = (name, key) => (m[name] && m[name].values ? m[name].values[key] : undefined);
  const dur = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs / 1000 : 0;
  const line = '='.repeat(78);
  const thin = '-'.repeat(78);

  let t = `${line}\nRELATORIO DE PERFORMANCE (k6) - perfil: ${PROFILE.toUpperCase()}\n${line}\n`;
  t += `Alvo           : ${BASE_URL}\n`;
  t += `Perfil         : ${VUS} usuarios simultaneos | subida ${RAMP_UP} | patamar ${HOLD} | descida ${RAMP_DOWN}\n`;
  t += `Pausa (think)  : ${THINK_MIN}-${THINK_MAX} s | escrita em ${Math.round(WRITE_RATIO * 100)}% das iteracoes\n`;
  t += `Limites        : p95 < ${P95_MS} ms | p99 < ${P99_MS} ms | erros < ${MAX_ERROR_RATE * 100}% | vazao > ${MIN_RPS} req/s\n`;
  t += `Duracao real   : ${num(dur, 1)} s\n\n`;

  t += `VOLUME E VAZAO\n${thin}\n`;
  t += `Requisicoes HTTP : ${v('http_reqs', 'count')}  (${num(v('http_reqs', 'rate'))} req/s em media)\n`;
  t += `Iteracoes        : ${v('iterations', 'count')}  (${num(v('iterations', 'rate'))} /s)\n`;
  t += `VUs (maximo)     : ${v('vus_max', 'max')}\n`;
  t += `Usuarios criados : ${v('users_created', 'count') || 0}\n`;
  t += `Dados recebidos  : ${num((v('data_received', 'count') || 0) / 1048576)} MB | enviados: ${num((v('data_sent', 'count') || 0) / 1048576)} MB\n\n`;

  t += `DISPONIBILIDADE\n${thin}\n`;
  t += `Requisicoes com falha  : ${num((v('http_req_failed', 'rate') || 0) * 100, 3)} %\n`;
  t += `Checks aprovados       : ${num((v('checks', 'rate') || 0) * 100, 3)} %  (${v('checks', 'passes')} ok / ${v('checks', 'fails')} falhas)\n`;
  t += `Erros de negocio       : ${num((v('business_errors', 'rate') || 0) * 100, 3)} %\n`;
  t += `Falhas de login        : ${v('login_failures', 'count') || 0}\n`;
  t += `Iteracoes descartadas  : ${v('dropped_iterations', 'count') || 0}\n\n`;

  t += `LATENCIA (ms)\n${thin}\n${pad('Metrica', 28)}${lpad('avg', 9)}${lpad('med', 9)}${lpad('p90', 9)}${lpad('p95', 9)}${lpad('p99', 9)}${lpad('max', 10)}\n`;
  const rowOf = (label, name) =>
    m[name]
      ? `${pad(label, 28)}${lpad(num(v(name, 'avg')), 9)}${lpad(num(v(name, 'med')), 9)}${lpad(num(v(name, 'p(90)')), 9)}${lpad(num(v(name, 'p(95)')), 9)}${lpad(num(v(name, 'p(99)')), 9)}${lpad(num(v(name, 'max')), 10)}\n`
      : '';
  t += rowOf('Total (http_req_duration)', 'http_req_duration');
  t += rowOf('Espera do servidor (TTFB)', 'http_req_waiting');
  t += rowOf('Conexao (connecting)', 'http_req_connecting');
  t += rowOf('Envio', 'http_req_sending');
  t += rowOf('Recebimento', 'http_req_receiving');
  t += rowOf('Bloqueio (blocked)', 'http_req_blocked');
  t += rowOf('Jornada (sem pausa final)', 'journey_duration');

  t += `\nPOR ENDPOINT (http_req_duration, ms)\n${thin}\n${pad('Endpoint', 18)}${lpad('reqs', 9)}${lpad('avg', 9)}${lpad('p90', 9)}${lpad('p95', 9)}${lpad('p99', 9)}${lpad('max', 10)}\n`;
  for (const ep of ENDPOINTS) {
    const key = `http_req_duration{endpoint:${ep}}`;
    if (m[key]) {
      const cnt = v(`http_reqs{endpoint:${ep}}`, 'count');
      t += `${pad(ep, 18)}${lpad(cnt !== undefined ? cnt : '-', 9)}${lpad(num(v(key, 'avg')), 9)}${lpad(num(v(key, 'p(90)')), 9)}${lpad(num(v(key, 'p(95)')), 9)}${lpad(num(v(key, 'p(99)')), 9)}${lpad(num(v(key, 'max')), 10)}\n`;
    }
  }

  t += `\nTHRESHOLDS (criterios de aprovacao)\n${thin}\n`;
  for (const [name, metric] of Object.entries(m)) {
    for (const th of thresholdsOf(metric)) t += `${th.ok ? '[OK]    ' : '[FALHOU]'} ${name}  ${th.expr}\n`;
  }
  t += `\nRESULTADO: ${allOk ? 'APROVADO (todos os thresholds atendidos)' : 'REPROVADO (ha thresholds nao atendidos)'}\n${line}\n`;
  return t;
}

// Resumo compacto em JSON, lido pelo relatório consolidado do pipeline
function buildCompact(data, allOk) {
  const m = data.metrics;
  const val = (name, key) => (m[name] && m[name].values ? m[name].values[key] : null);
  const trend = (name) => ({
    avg: val(name, 'avg'),
    med: val(name, 'med'),
    p90: val(name, 'p(90)'),
    p95: val(name, 'p(95)'),
    p99: val(name, 'p(99)'),
    max: val(name, 'max'),
  });
  const endpoints = {};
  for (const ep of ENDPOINTS) {
    const key = `http_req_duration{endpoint:${ep}}`;
    if (m[key]) endpoints[ep] = { count: val(`http_reqs{endpoint:${ep}}`, 'count'), ...trend(key) };
  }
  const thresholds = [];
  for (const [name, metric] of Object.entries(m)) for (const th of thresholdsOf(metric)) thresholds.push({ metric: name, expr: th.expr, ok: th.ok });
  return {
    profile: PROFILE,
    target: BASE_URL,
    config: { vus: VUS, rampUp: RAMP_UP, hold: HOLD, rampDown: RAMP_DOWN, think: [THINK_MIN, THINK_MAX], writeRatio: WRITE_RATIO, p95Ms: P95_MS, p99Ms: P99_MS, maxErrorRate: MAX_ERROR_RATE, minRps: MIN_RPS },
    durationSec: data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs / 1000 : null,
    requests: val('http_reqs', 'count'),
    throughputRps: val('http_reqs', 'rate'),
    iterations: val('iterations', 'count'),
    vusMax: val('vus_max', 'max'),
    failedRate: val('http_req_failed', 'rate'),
    checksRate: val('checks', 'rate'),
    businessErrorRate: val('business_errors', 'rate'),
    latency: trend('http_req_duration'),
    ttfb: trend('http_req_waiting'),
    endpoints,
    thresholds,
    passed: allOk,
  };
}

export function handleSummary(data) {
  const allOk = Object.values(data.metrics).every((metric) => thresholdsOf(metric).every((th) => th.ok));
  const text = buildText(data, allOk);
  return {
    stdout: text,
    [`${REPORT_DIR}/k6-resumo.txt`]: text,
    [`${REPORT_DIR}/perf-summary.json`]: JSON.stringify(buildCompact(data, allOk), null, 2),
    [`${REPORT_DIR}/k6-summary-completo.json`]: JSON.stringify(data, null, 2),
    [`${REPORT_DIR}/load-report.html`]: renderHtml(data, {
      baseUrl: BASE_URL,
      profile: PROFILE,
      stages: STAGES,
      think: [THINK_MIN, THINK_MAX],
    }),
  };
}
