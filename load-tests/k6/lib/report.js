// Geração dos relatórios do teste de carga (texto e HTML autônomo, sem dependências externas).

const val = (data, name) => (data.metrics[name] ? data.metrics[name].values : null);
const num = (n, d = 2) => (n === undefined || n === null || Number.isNaN(n) ? '-' : Number(n).toFixed(d));
const ms = (n) => (n === undefined || n === null ? '-' : `${num(n, 1)} ms`);
const pct = (r) => (r === undefined || r === null ? '-' : `${num(r * 100, 2)}%`);
const mb = (b) => (b === undefined || b === null ? '-' : b < 1e6 ? `${num(b / 1e3, 1)} KB` : `${num(b / 1e6, 1)} MB`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function durationMs(data) {
  return data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : 0;
}

/** Lista todos os thresholds avaliados: [{metric, expr, ok}] */
function thresholds(data) {
  const out = [];
  for (const [metric, m] of Object.entries(data.metrics)) {
    if (!m.thresholds) continue;
    for (const [expr, r] of Object.entries(m.thresholds)) {
      if (expr === 'count>=0') continue; // auxiliar: só cria a sub-métrica de contagem por endpoint
      out.push({ metric, expr, ok: typeof r === 'object' ? r.ok : !r });
    }
  }
  return out;
}

/** Métricas de duração por endpoint (sub-métricas http_req_duration{name:...}) */
function endpoints(data) {
  const rows = [];
  const prefix = 'http_req_duration{endpoint:';
  for (const [k, m] of Object.entries(data.metrics)) {
    if (!k.startsWith(prefix)) continue;
    const cnt = data.metrics[`http_reqs{endpoint:${k.slice(prefix.length, -1)}}`];
    rows.push({ name: k.slice(prefix.length, -1), v: m.values, count: cnt ? cnt.values.count : null });
  }
  return rows;
}

/** Checks agrupados: [{name, passes, fails}] (percorre os grupos recursivamente) */
function checks(data) {
  const out = [];
  (function walk(g, path) {
    for (const c of g.checks || []) out.push({ group: path, name: c.name, passes: c.passes, fails: c.fails });
    for (const sub of g.groups || []) walk(sub, sub.name);
  })(data.root_group, '');
  return out;
}

function summary(data, ctx) {
  const dur = val(data, 'http_req_duration') || {};
  const reqs = val(data, 'http_reqs') || {};
  const failed = val(data, 'http_req_failed') || {};
  const iters = val(data, 'iterations') || {};
  const vus = val(data, 'vus_max') || {};
  const sent = val(data, 'data_sent') || {};
  const recv = val(data, 'data_received') || {};
  const chk = val(data, 'checks') || {};
  const th = thresholds(data);
  return { dur, reqs, failed, iters, vus, sent, recv, chk, th, passed: th.every((t) => t.ok), total: durationMs(data) };
}

// ---------------------------------------------------------------- HTML
export function renderHtml(data, ctx) {
  const s = summary(data, ctx);
  const dur = s.dur;
  const eps = endpoints(data);
  const maxP95 = Math.max(1, ...eps.map((e) => e.v['p(95)'] || 0));
  const card = (label, value, sub = '') => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
  const stages = ctx.stages.map((x) => `${x.duration} → ${x.target} VUs`).join(' · ');

  const bars = eps
    .map((e) => {
      const w = Math.max(1, Math.round(((e.v['p(95)'] || 0) / maxP95) * 100));
      return `<tr><td>${esc(e.name)}</td><td class="r">${e.count === null ? '-' : e.count}</td><td class="r">${num(e.v.avg, 1)}</td><td class="r">${num(e.v['p(90)'], 1)}</td><td class="r">${num(e.v['p(95)'], 1)}</td><td class="r">${num(e.v['p(99)'], 1)}</td><td class="r">${num(e.v.max, 1)}</td><td><div class="bar"><span style="width:${w}%"></span></div></td></tr>`;
    })
    .join('');
  const ths = s.th.map((x) => `<tr class="${x.ok ? 'ok' : 'bad'}"><td>${x.ok ? '✔ OK' : '✘ FALHOU'}</td><td>${esc(x.metric)}</td><td>${esc(x.expr)}</td></tr>`).join('');
  const chs = checks(data).map((c) => `<tr class="${c.fails ? 'bad' : 'ok'}"><td>${c.fails ? '✘' : '✔'}</td><td>${esc(c.name)}</td><td class="r">${c.passes}</td><td class="r">${c.fails}</td></tr>`).join('');

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório de carga K6</title>
<style>
:root{--bg:#fff;--fg:#1c2230;--mut:#5b6478;--line:#dfe3ec;--card:#f5f7fb;--ok:#1a7f4b;--bad:#c62f3e;--acc:#3459d6}
@media (prefers-color-scheme:dark){:root{--bg:#10141c;--fg:#e6e9f0;--mut:#98a2b8;--line:#2a3142;--card:#181e2a;--ok:#4cc38a;--bad:#ff6b78;--acc:#7c9cff}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
main{max-width:1000px;margin:0 auto;padding:24px 16px 56px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}
.meta{color:var(--mut);font-size:13px}
.verdict{display:inline-block;margin:14px 0;padding:6px 14px;border-radius:999px;font-weight:600;color:#fff;background:${s.passed ? 'var(--ok)' : 'var(--bad)'}}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.label{font-size:12px;color:var(--mut)}.value{font-size:22px;font-weight:650}.sub{font-size:12px;color:var(--mut)}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}
th{color:var(--mut);font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}
tr.ok td:first-child{color:var(--ok)}tr.bad td:first-child{color:var(--bad)}tr.bad{background:rgba(198,47,62,.08)}
.bar{background:var(--line);border-radius:4px;height:8px;min-width:80px}.bar span{display:block;height:8px;border-radius:4px;background:var(--acc)}
.scroll{overflow-x:auto}
</style></head><body><main>
<h1>Relatório de teste de carga (K6)</h1>
<div class="meta">Alvo: ${esc(ctx.baseUrl)} · Perfil: ${esc(ctx.profile)} · ${esc(stages)} · Espera: ${ctx.think[0]}–${ctx.think[1]} s · Duração: ${num(s.total / 1000, 1)} s</div>
<div class="verdict">${s.passed ? 'APROVADO: todos os thresholds atendidos' : 'REPROVADO: algum threshold falhou'}</div>
<div class="cards">
${card('VUs máximos', num(s.vus.max, 0))}
${card('Requisições', num(s.reqs.count, 0), `${num(s.reqs.rate, 1)} req/s`)}
${card('Latência p95', ms(dur['p(95)']), `média ${ms(dur.avg)}`)}
${card('Latência p99', ms(dur['p(99)']), `máx ${ms(dur.max)}`)}
${card('Falhas HTTP', pct(s.failed.rate), `${num(s.failed.passes, 0)} requisições`)}
${card('Checks', pct(s.chk.rate), `${num(s.chk.fails, 0)} falhas`)}
</div>
<h2>Latência por endpoint (ms)</h2>
<div class="scroll"><table><thead><tr><th>Endpoint</th><th class="r">reqs</th><th class="r">média</th><th class="r">p90</th><th class="r">p95</th><th class="r">p99</th><th class="r">máx</th><th>p95 (relativo)</th></tr></thead><tbody>${bars}</tbody></table></div>
<h2>Thresholds</h2>
<div class="scroll"><table><thead><tr><th>Resultado</th><th>Métrica</th><th>Critério</th></tr></thead><tbody>${ths}</tbody></table></div>
<h2>Checks</h2>
<div class="scroll"><table><thead><tr><th></th><th>Verificação</th><th class="r">ok</th><th class="r">falhas</th></tr></thead><tbody>${chs}</tbody></table></div>
</main></body></html>`;
}
