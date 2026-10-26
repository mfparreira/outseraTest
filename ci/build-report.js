/**
 * Relatório consolidado do pipeline.
 *
 * Uso: node ci/build-report.js <pasta-artefatos> <pasta-saida>
 *
 * Lê os resultados baixados dos jobs:
 *   <artefatos>/api-local-reports/results.json            (Playwright JSON)
 *   <artefatos>/api-jsonplaceholder-reports/results.json  (Playwright JSON)
 *   <artefatos>/e2e-reports/cucumber-report.json          (Cucumber JSON)
 *   <artefatos>/cypress-reports/cypress-summary.json      (resumo gerado por cypress.config.ts)
 *   <artefatos>/a11y-reports/results.json                 (Playwright JSON, suíte axe)
 *   <artefatos>/perf-smoke-reports/perf-summary.json      (k6, perfil smoke)
 *   <artefatos>/perf-load-reports/perf-summary.json       (k6, perfil load; só em execução manual/agendada)
 * e gera:
 *   <saida>/RELATORIO-PIPELINE.txt
 *   <saida>/RELATORIO-PIPELINE.md
 * Em GitHub Actions também escreve o resumo em $GITHUB_STEP_SUMMARY.
 */
const fs = require('fs');
const path = require('path');

const base = process.argv[2] || 'artifacts';
const outDir = process.argv[3] || 'pipeline-report';
const env = process.env;

const tz = { timeZone: 'America/Sao_Paulo' };
const fmtDate = (d) => new Date(d).toLocaleString('pt-BR', tz);
const fmtSec = (ms) => `${(ms / 1000).toFixed(2)} s`;

// ---------------------------------------------------------------- leitura
function readJson(rel) {
  const p = path.join(base, rel);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/** Playwright JSON -> linhas normalizadas */
function loadPlaywright(rel, opts = {}) {
  const data = readJson(rel);
  if (!data) return null;
  const rows = [];
  (function walk(s, titles = []) {
    const t = s.title && !/\.(js|ts)$/.test(s.title) ? [...titles, s.title] : titles;
    for (const spec of s.specs || []) {
      const test = spec.tests[0];
      const last = test.results[test.results.length - 1];
      rows.push({
        group: t.join(' › '),
        title: spec.title,
        status: test.status === 'expected' ? 'passed' : test.status === 'skipped' ? 'skipped' : 'failed',
        flaky: test.status === 'flaky',
        ms: last ? last.duration : 0,
        error: last && last.error ? last.error.message.split('\n')[0] : '',
        notes: (test.annotations || []).map((a) => `${a.type}: ${a.description}`),
        kind: /negativos|Critério de falha|erro/i.test(t.join(' ') + ' ' + spec.title) ? 'Negativo' : 'Positivo',
        bucket: opts.bucketByGroup ? t.join(' › ') || 'Geral' : bucketOf(t.join(' ')),
      });
    }
    for (const c of s.suites || []) walk(c, t);
  })({ suites: data.suites, title: '' });
  return { rows, ms: data.stats.duration, start: data.stats.startTime };
}

function bucketOf(describe) {
  const m = describe.match(/^(GET|POST|PUT|PATCH|DELETE)\b/);
  if (m) return m[1];
  if (/Métodos HTTP inválidos/.test(describe)) return 'Métodos inválidos';
  if (/Autentica/.test(describe)) return 'Autenticação';
  return 'Outros';
}

/** Cucumber JSON -> linhas normalizadas (um cenário = uma linha) */
function loadCucumber(rel) {
  const data = readJson(rel);
  if (!data) return null;
  const rows = [];
  for (const f of data) {
    for (const el of f.elements || []) {
      if (el.type !== 'scenario') continue;
      const steps = el.steps || [];
      const statuses = steps.map((s) => s.result.status);
      const failedStep = steps.find((s) => ['failed', 'ambiguous', 'undefined', 'pending'].includes(s.result.status));
      const status = failedStep ? 'failed' : statuses.every((s) => s === 'skipped') ? 'skipped' : 'passed';
      // Em "Esquema do Cenário" o nome se repete: usa o passo "Quando" para distinguir as linhas.
      const when = el.keyword && /Esquema/i.test(el.keyword) ? steps.find((s) => /^(Quando|When)/i.test(s.keyword || '')) : null;
      rows.push({
        group: f.name,
        title: when ? `${el.name} → ${when.name}` : el.name,
        status,
        flaky: false,
        ms: Math.round(steps.reduce((a, s) => a + (s.result.duration || 0), 0) / 1e6), // ns -> ms
        error: failedStep ? (failedStep.result.error_message || '').split('\n')[0] : '',
        notes: [],
        kind: /negativ/i.test(el.name) ? 'Negativo' : 'Positivo',
        bucket: f.name,
      });
    }
  }
  return { rows, ms: rows.reduce((a, r) => a + r.ms, 0), start: null };
}

/** Resumo do Cypress -> linhas normalizadas */
function loadCypress(rel) {
  const data = readJson(rel);
  if (!data) return null;
  const rows = [];
  for (const sp of data.specs) {
    for (const t of sp.tests) {
      rows.push({
        group: sp.spec.replace(/^cypress\/e2e\//, ''),
        title: t.title,
        status: t.state === 'passed' ? 'passed' : t.state === 'failed' ? 'failed' : 'skipped',
        flaky: false,
        ms: t.durationMs || 0,
        error: t.error || '',
        notes: [],
        kind: /rejeita|bloqueia|bloqueado|sem |redireciona/i.test(t.title) ? 'Negativo' : 'Positivo',
        bucket: sp.spec.replace(/^cypress\/e2e\//, ''),
      });
    }
  }
  return { rows, ms: data.durationMs, start: null };
}

/** Resumo do k6 (perf-summary.json) */
function loadPerf(rel) {
  return readJson(rel);
}

// ---------------------------------------------------------------- suítes
const suites = [
  { id: 'api-local', tipo: 'API', nome: 'API de exemplo local', ferramenta: 'Playwright (APIRequestContext)', res: loadPlaywright('api-local-reports/results.json') },
  { id: 'api-jp', tipo: 'API', nome: 'API JSONPlaceholder', ferramenta: 'Playwright (APIRequestContext)', res: loadPlaywright('api-jsonplaceholder-reports/results.json') },
  { id: 'e2e', tipo: 'E2E', nome: 'E2E SauceDemo', ferramenta: 'Cucumber + Playwright + TypeScript', res: loadCucumber('e2e-reports/cucumber-report.json') },
  { id: 'cypress', tipo: 'E2E', nome: 'Cypress (mini-suíte)', ferramenta: 'Cypress + TypeScript', res: loadCypress('cypress-reports/cypress-summary.json') },
  { id: 'a11y', tipo: 'Acessib.', nome: 'Acessibilidade (axe)', ferramenta: 'axe-core + Playwright', res: loadPlaywright('a11y-reports/results.json', { bucketByGroup: true }) },
];

// Performance: não entra na contagem de testes; o critério é "todos os thresholds do k6 passaram".
const perfs = [
  { nome: 'smoke', obrigatorio: true, data: loadPerf('perf-smoke-reports/perf-summary.json') },
  { nome: 'load', obrigatorio: false, data: loadPerf('perf-load-reports/perf-summary.json') },
];
const perfFalhou = perfs.some((p) => (p.data && !p.data.passed) || (p.obrigatorio && !p.data));

const count = (rows, st) => rows.filter((r) => r.status === st).length;
const summarize = (s) => {
  if (!s.res) return { total: 0, passed: 0, failed: 0, skipped: 0, ms: 0, status: 'SEM RESULTADO' };
  const rows = s.res.rows;
  const failed = count(rows, 'failed');
  return {
    total: rows.length,
    passed: count(rows, 'passed'),
    failed,
    skipped: count(rows, 'skipped'),
    ms: s.res.ms,
    status: failed ? 'FALHOU' : 'APROVADO',
  };
};
suites.forEach((s) => (s.sum = summarize(s)));

const all = suites.flatMap((s) => (s.res ? s.res.rows : []));
const tot = { total: all.length, passed: count(all, 'passed'), failed: count(all, 'failed'), skipped: count(all, 'skipped') };
const semResultado = suites.filter((s) => !s.res);
const overall = tot.failed || semResultado.length || perfFalhou ? 'FALHOU' : 'APROVADO';

// metadados da execução
const repo = env.GITHUB_REPOSITORY;
const runUrl = repo && env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : '';
const meta = {
  Repositório: repo || '(execução local)',
  Branch: env.GITHUB_REF_NAME || '-',
  Commit: env.GITHUB_SHA ? env.GITHUB_SHA.slice(0, 7) : '-',
  'Disparado por': env.GITHUB_EVENT_NAME ? `${env.GITHUB_EVENT_NAME} (${env.GITHUB_ACTOR || '-'})` : '-',
  Execução: env.GITHUB_RUN_NUMBER ? `#${env.GITHUB_RUN_NUMBER}` : '-',
  Gerado: fmtDate(Date.now()),
};
const jobResults = [
  ['API (2 suítes)', env.API_RESULT],
  ['E2E (Cucumber + Playwright)', env.E2E_RESULT],
  ['Cypress', env.CYPRESS_RESULT],
  ['Acessibilidade (axe)', env.A11Y_RESULT],
  ['Performance - smoke', env.PERF_SMOKE_RESULT],
  ['Performance - load (500 VUs)', !env.PERF_LOAD_RESULT || env.PERF_LOAD_RESULT === 'skipped' ? 'não executado nesta execução (manual/agendado)' : env.PERF_LOAD_RESULT],
  ['Mobile', env.MOBILE_RESULT === 'skipped' || !env.MOBILE_RESULT ? 'não executado (fora do escopo)' : env.MOBILE_RESULT],
];

// ---------------------------------------------------------------- agrupamentos
function groupBy(rows, fn) {
  const g = new Map();
  for (const r of rows) {
    const k = fn(r);
    const v = g.get(k) || { total: 0, passed: 0, failed: 0 };
    v.total++;
    if (r.status === 'passed') v.passed++;
    if (r.status === 'failed') v.failed++;
    g.set(k, v);
  }
  return [...g.entries()];
}

// ---------------------------------------------------------------- markdown
const icon = (st) => (st === 'passed' ? '✅' : st === 'skipped' ? '⏭️' : '❌');
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

let md = `# ${overall === 'APROVADO' ? '✅' : '❌'} Relatório do pipeline: ${overall}\n\n`;
md += Object.entries(meta).map(([k, v]) => `- **${k}:** ${v}`).join('\n') + '\n';
if (runUrl) md += `- **Link da execução:** ${runUrl}\n`;

md += `\n## Resultado dos jobs\n\n| Job | Resultado |\n|---|---|\n`;
md += jobResults.map(([n, r]) => `| ${n} | ${esc(r || '-')} |`).join('\n') + '\n';

md += `\n## Resumo por suíte\n\n| Tipo | Suíte | Ferramenta | Testes | ✅ | ❌ | ⏭️ | Duração | Status |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const s of suites) {
  const x = s.sum;
  md += `| ${s.tipo} | ${s.nome} | ${s.ferramenta} | ${x.total} | ${x.passed} | ${x.failed} | ${x.skipped} | ${fmtSec(x.ms)} | ${x.status} |\n`;
}
md += `| Mobile | — | — | — | — | — | — | — | NÃO EXECUTADO |\n`;
md += `| **Total** | | | **${tot.total}** | **${tot.passed}** | **${tot.failed}** | **${tot.skipped}** | | **${overall}** |\n`;

md += `\n## Positivos x Negativos\n\n| Tipo | Testes | ✅ | ❌ |\n|---|---|---|---|\n`;
for (const [k, v] of groupBy(all, (r) => r.kind)) md += `| ${k} | ${v.total} | ${v.passed} | ${v.failed} |\n`;

for (const s of suites) {
  md += `\n## ${s.tipo}: ${s.nome}\n\n`;
  if (!s.res) {
    md += `⚠️ Nenhum resultado encontrado (o job pode ter falhado antes de executar os testes).\n`;
    continue;
  }
  md += `| Grupo | Testes | ✅ | ❌ |\n|---|---|---|---|\n`;
  for (const [k, v] of groupBy(s.res.rows, (r) => r.bucket)) md += `| ${esc(k)} | ${v.total} | ${v.passed} | ${v.failed} |\n`;
  const fails = s.res.rows.filter((r) => r.status === 'failed');
  md += fails.length
    ? `\n**Falhas (${fails.length})**\n\n` + fails.map((r) => `- ❌ ${esc(r.group)} › ${esc(r.title)}\n  \`${esc(r.error).slice(0, 300)}\``).join('\n') + '\n'
    : `\nNenhuma falha.\n`;
  md += `\n<details><summary>Detalhamento dos ${s.res.rows.length} testes</summary>\n\n| # | Resultado | Tipo | Grupo | Cenário | ms |\n|---|---|---|---|---|---|\n`;
  s.res.rows.forEach((r, i) => {
    md += `| ${i + 1} | ${icon(r.status)} | ${r.kind} | ${esc(r.group)} | ${esc(r.title)}${r.flaky ? ' (instável)' : ''} | ${r.ms} |\n`;
  });
  md += `\n</details>\n`;
}

const ms = (v) => (v === undefined ? '-' : `${Number(v).toFixed(2)} ms`);
md += `\n## Performance (k6)\n\n| Perfil | Usuários | Duração | Requisições | Vazão | p95 | p99 | Erros | Thresholds |\n|---|---|---|---|---|---|---|---|---|\n`;
for (const p of perfs) {
  const d = p.data;
  md += d
    ? `| ${p.nome} | ${d.vusMax} | ${d.durationSec.toFixed(0)} s | ${d.requests} | ${d.throughputRps.toFixed(1)} req/s | ${ms(d.latency.p95)} | ${ms(d.latency.p99)} | ${(d.failedRate * 100).toFixed(2)}% | ${d.passed ? '✅ aprovado' : '❌ reprovado'} |\n`
    : `| ${p.nome} | - | - | - | - | - | - | - | ${p.obrigatorio ? '❌ sem resultado' : 'não executado'} |\n`;
}
for (const p of perfs.filter((x) => x.data && !x.data.passed)) {
  md += `\n**Thresholds violados (${p.nome}):** ` + p.data.thresholds.filter((t) => !t.ok).map((t) => `\`${t.metric} ${t.expr}\``).join(', ') + '\n';
}

md += `\n## Mobile\n\nNão executado: fora do escopo deste projeto. O job \`mobile\` está declarado no workflow e aparece como *skipped*; a integração prevista está descrita em \`mobile-tests/README.md\`.\n`;
md += `\n## Artefatos desta execução\n\n- \`api-local-reports\` e \`api-jsonplaceholder-reports\`: HTML interativo, JSON e JUnit\n- \`e2e-reports\`: HTML do Cucumber, JSON, JUnit, screenshots e Playwright Trace dos cenários que falharam\n- \`cypress-reports\`: JUnit, resumo JSON e screenshots de falhas\n- \`a11y-reports\`: relatório HTML/JSON/JUnit do axe (com o JSON completo de violações anexado a cada teste)\n- \`perf-smoke-reports\` / \`perf-load-reports\`: resumo, relatório HTML, dashboard do k6 e série temporal\n- \`pipeline-report\`: este relatório (.txt e .md)\n`;

// ---------------------------------------------------------------- texto puro
const line = '='.repeat(78);
const thin = '-'.repeat(78);
const col = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

let txt = `${line}\nRELATORIO DO PIPELINE DE CI - TESTES AUTOMATIZADOS\n${line}\n`;
for (const [k, v] of Object.entries(meta)) txt += `${col(k, 15)}: ${v}\n`;
if (runUrl) txt += `${col('Link', 15)}: ${runUrl}\n`;
txt += `${col('Status geral', 15)}: ${overall}\n\n`;

txt += `RESULTADO DOS JOBS\n${thin}\n`;
for (const [n, r] of jobResults) txt += `${col(n, 32)} ${r || '-'}\n`;

txt += `\nRESUMO POR SUITE\n${thin}\n${col("Suite", 38)}${num('Testes', 7)}${num('Aprov.', 8)}${num('Reprov.', 9)}${num('Ignor.', 8)}${num('Tempo', 10)}  Status\n`;
for (const s of suites) {
  const x = s.sum;
  txt += `${col(`${s.tipo} - ${s.nome}`, 38)}${num(x.total, 7)}${num(x.passed, 8)}${num(x.failed, 9)}${num(x.skipped, 8)}${num(fmtSec(x.ms), 10)}  ${x.status}\n`;
}
txt += `${col("Mobile", 38)}${num('-', 7)}${num('-', 8)}${num('-', 9)}${num('-', 8)}${num('-', 10)}  NAO EXECUTADO\n`;
txt += `${col("TOTAL", 38)}${num(tot.total, 7)}${num(tot.passed, 8)}${num(tot.failed, 9)}${num(tot.skipped, 8)}${num('', 10)}  ${overall}\n`;

txt += `\nPOSITIVOS x NEGATIVOS\n${thin}\n`;
for (const [k, v] of groupBy(all, (r) => r.kind)) txt += `${col(k, 12)} ${num(v.total, 4)} testes | ${v.passed} aprovados | ${v.failed} reprovados\n`;

for (const s of suites) {
  txt += `\n${line}\n${s.tipo}: ${s.nome} (${s.ferramenta})\n${line}\n`;
  if (!s.res) {
    txt += `Nenhum resultado encontrado (o job pode ter falhado antes de executar os testes).\n`;
    continue;
  }
  if (s.res.start) txt += `Inicio: ${fmtDate(s.res.start)} | Duracao: ${fmtSec(s.sum.ms)}\n`;
  txt += `\nPor grupo\n`;
  for (const [k, v] of groupBy(s.res.rows, (r) => r.bucket)) txt += `  ${col(k, 40)} ${num(v.total, 3)} testes | ${v.passed} ok | ${v.failed} falhas\n`;
  txt += `\nDetalhamento\n${thin}\n`;
  s.res.rows.forEach((r, i) => {
    txt += `[${String(i + 1).padStart(3, '0')}] ${r.status === 'passed' ? 'PASSOU ' : r.status === 'skipped' ? 'IGNORADO' : 'FALHOU '} ${col(r.kind, 8)} ${r.group}\n      ${r.title} (${r.ms} ms)${r.flaky ? ' [instavel]' : ''}\n`;
    for (const n of r.notes) txt += `      * ${n}\n`;
    if (r.status === 'failed') txt += `      ! ${r.error.slice(0, 300)}\n`;
  });
  const fails = s.res.rows.filter((r) => r.status === 'failed');
  txt += `\nFalhas\n${thin}\n${fails.length ? fails.map((r) => `- ${r.group} > ${r.title}\n  ${r.error.slice(0, 300)}`).join('\n') : 'Nenhuma falha.'}\n`;
}

txt += `\n${line}\nPERFORMANCE (k6)\n${line}\n`;
for (const p of perfs) {
  const d = p.data;
  if (!d) { txt += `${p.nome}: ${p.obrigatorio ? 'SEM RESULTADO' : 'nao executado nesta execucao'}\n`; continue; }
  txt += `${p.nome}: ${d.passed ? 'APROVADO' : 'REPROVADO'} | ${d.vusMax} VUs | ${d.durationSec.toFixed(0)} s | ${d.requests} req | ${d.throughputRps.toFixed(1)} req/s | p95 ${ms(d.latency.p95)} | p99 ${ms(d.latency.p99)} | erros ${(d.failedRate * 100).toFixed(2)}%\n`;
  for (const t of d.thresholds.filter((x) => !x.ok)) txt += `   ! threshold violado: ${t.metric} ${t.expr}\n`;
}

txt += `\n${line}\nMOBILE\n${line}\nNao executado: fora do escopo deste projeto. O job "mobile" esta declarado no\nworkflow (aparece como skipped); a integracao prevista esta em mobile-tests/README.md.\n${line}\n`;

// ---------------------------------------------------------------- saída
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'RELATORIO-PIPELINE.md'), md, 'utf8');
fs.writeFileSync(path.join(outDir, 'RELATORIO-PIPELINE.txt'), txt, 'utf8');
if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, md);

console.log(`Relatório gerado em ${outDir}/ | status: ${overall} | ${tot.passed}/${tot.total} aprovados` + (semResultado.length ? ` | sem resultado: ${semResultado.map((s) => s.nome).join(', ')}` : ''));
