#!/usr/bin/env node
/**
 * Lê a série temporal do monitor e gera:
 *   reports/ANALISE-TEMPORAL.txt   tabela por janela + observações automáticas
 *   reports/timeseries.html        gráficos (SVG, sem dependências)
 *
 * Uso: node scripts/analyze.js [reports/timeseries.csv] [--bucket 30]
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const bucketIdx = argv.indexOf('--bucket');
const bucket = bucketIdx >= 0 ? Number(argv[bucketIdx + 1]) : 30;
const csvPath = argv.find((a) => a.endsWith('.csv')) || 'reports/timeseries.csv';
const outDir = path.dirname(csvPath);

const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const cols = lines[0].split(',');
const rows = lines.slice(1).map((l) => {
  const v = l.split(',');
  const o = {};
  cols.forEach((c, i) => (o[c] = v[i] === '' || v[i] === undefined ? null : Number(v[i])));
  return o;
});
if (!rows.length) { console.error('CSV sem dados.'); process.exit(1); }

// A API do k6 pode atrasar a atualização do contador quando o gerador está saturado e depois "recuperar"
// tudo de uma vez (um segundo com vazão absurda). Para não distorcer, a vazão é recalculada pela variação do
// contador acumulado numa janela móvel de 5 amostras, em vez de usar o valor instantâneo de cada segundo.
rows.forEach((r, i) => {
  const j = Math.max(0, i - 5);
  const dt = r.t_s - rows[j].t_s;
  if (dt > 0 && r.reqs_total !== null && rows[j].reqs_total !== null) r.rps = (r.reqs_total - rows[j].reqs_total) / dt;
});

const cores = rows[0].cores || 1;
const mean = (a) => { const x = a.filter((n) => n !== null && !Number.isNaN(n)); return x.length ? x.reduce((s, n) => s + n, 0) / x.length : null; };
const max = (a) => { const x = a.filter((n) => n !== null); return x.length ? Math.max(...x) : null; };
const f = (n, d = 1) => (n === null || n === undefined ? '-' : n.toFixed(d));

// agrupa em janelas de `bucket` segundos
const groups = new Map();
for (const r of rows) {
  const k = Math.floor(r.t_s / bucket) * bucket;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
const win = [...groups.entries()].map(([t, g]) => ({
  t,
  vus: max(g.map((r) => r.vus)),
  rps: (() => { // vazão da janela = requisições acumuladas no fim da janela menos as do fim da janela anterior
    const prevLast = rows.filter((r) => r.t_s < t && r.reqs_total !== null).pop() || rows[0];
    const last = g.filter((r) => r.reqs_total !== null).pop() || prevLast; // o k6 às vezes não responde quando saturado (linha vazia)
    const dt = last.t_s - prevLast.t_s;
    return dt > 0 ? (last.reqs_total - prevLast.reqs_total) / dt : mean(g.map((r) => r.rps));
  })(),
  avg: mean(g.map((r) => r.avg_ms_window)),
  avgMax: max(g.map((r) => r.avg_ms_window)),
  fail: mean(g.map((r) => r.fail_pct_window)),
  probe: mean(g.map((r) => r.probe_ms)),
  probeMax: max(g.map((r) => r.probe_ms)),
  srv: mean(g.map((r) => r.server_cpu_pct)),
  srvMax: max(g.map((r) => r.server_cpu_pct)),
  k6: mean(g.map((r) => r.k6_cpu_pct)),
  sys: mean(g.map((r) => r.sys_cpu_pct)),
  rss: max(g.map((r) => r.server_rss_mb)),
}));

// ------------------------------------------------------------ texto
const line = '='.repeat(100);
let t = `${line}\nANALISE TEMPORAL DO TESTE DE CARGA (janelas de ${bucket}s)\n${line}\n`;
t += `Maquina: ${cores} nucleo(s). CPU do servidor/K6 em % de UM nucleo (pode passar de 100%); CPU total em % da maquina.\n\n`;
t += `${'t(s)'.padStart(5)} ${'VUs'.padStart(5)} ${'req/s'.padStart(7)} ${'lat.med'.padStart(8)} ${'lat.max'.padStart(8)} ${'falha%'.padStart(7)} ${'sonda'.padStart(7)} ${'CPU srv'.padStart(8)} ${'CPU k6'.padStart(7)} ${'CPU tot'.padStart(8)} ${'RSS MB'.padStart(7)}\n`;
t += `${'-'.repeat(100)}\n`;
for (const w of win) {
  t += `${String(w.t).padStart(5)} ${f(w.vus, 0).padStart(5)} ${f(w.rps, 0).padStart(7)} ${f(w.avg).padStart(8)} ${f(w.avgMax).padStart(8)} ${f(w.fail, 2).padStart(7)} ${f(w.probe).padStart(7)} ${f(w.srv, 0).padStart(8)} ${f(w.k6, 0).padStart(7)} ${f(w.sys, 0).padStart(8)} ${f(w.rss).padStart(7)}\n`;
}
t += `(latencias em ms: lat.med = media da janela medida pelo K6; sonda = GET /api/health medido por fora)\n\n`;

// ------------------------------------------------------------ observações automáticas
const peak = (key) => win.reduce((b, w) => (w[key] !== null && (b === null || w[key] > b[key]) ? w : b), null);
const obs = [];
const pRps = peak('rps'), pAvg = peak('avg'), pSrv = peak('srv'), pK6 = peak('k6'), pSys = peak('sys'), pRss = peak('rss');
const loaded = win.filter((w) => w.vus > 0);
const baseline = loaded.length ? [...loaded.map((w) => w.avg).filter((x) => x !== null)].sort((a, b) => a - b)[Math.floor(loaded.length / 4)] : null;
if (pRps) obs.push(`Pico de vazao: ${f(pRps.rps, 0)} req/s na janela de ${pRps.t}s (${f(pRps.vus, 0)} VUs).`);
if (pAvg) obs.push(`Maior latencia media de janela: ${f(pAvg.avg)} ms em ${pAvg.t}s (${f(pAvg.vus, 0)} VUs).`);
if (pSrv) obs.push(`CPU maxima do servidor: ${f(pSrv.srv, 0)}% de um nucleo em ${pSrv.t}s (pico instantaneo ${f(pSrv.srvMax, 0)}%).`);
if (pK6) obs.push(`CPU maxima do K6: ${f(pK6.k6, 0)}% de um nucleo em ${pK6.t}s.`);
if (pSys) obs.push(`CPU total maxima da maquina: ${f(pSys.sys, 0)}% em ${pSys.t}s.`);
if (pRss) obs.push(`Memoria maxima do servidor: ${f(pRss.rss)} MB (inicio: ${f(win[0].rss)} MB).`);
const failing = win.filter((w) => w.fail !== null && w.fail > 0.5);
obs.push(failing.length ? `Falhas acima de 0,5% em ${failing.length} janela(s); a primeira em ${failing[0].t}s (${f(failing[0].vus, 0)} VUs).` : 'Nenhuma janela com falhas acima de 0,5%.');
if (baseline !== null) {
  const knee = loaded.find((w) => w.avg !== null && w.avg > Math.max(baseline * 5, baseline + 20));
  obs.push(knee ? `Ponto de degradacao: latencia media passou de 5x a linha de base (${f(baseline)} ms) em ${knee.t}s, com ${f(knee.vus, 0)} VUs e ${f(knee.rps, 0)} req/s.` : `Sem degradacao: a latencia media nunca passou de 5x a linha de base (${f(baseline)} ms).`);
}
const sysHot = win.filter((w) => w.sys !== null && w.sys > 85);
obs.push(sysHot.length ? `ATENCAO: CPU total acima de 85% em ${sysHot.length} janela(s). Como o K6 e o servidor dividem a maquina, parte da latencia pode ser do gerador de carga.` : 'CPU total da maquina ficou abaixo de 85%: o gerador de carga nao foi o limitante.');
t += `OBSERVACOES AUTOMATICAS\n${'-'.repeat(100)}\n${obs.map((o) => `- ${o}`).join('\n')}\n${line}\n`;
fs.writeFileSync(path.join(outDir, 'ANALISE-TEMPORAL.txt'), t, 'utf8');
console.log(t);

// ------------------------------------------------------------ gráficos SVG
function chart(title, series, unit) {
  const W = 920, H = 230, L = 56, R = 16, T = 28, B = 34;
  const xs = rows.map((r) => r.t_s);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ys = series.flatMap((s) => rows.map((r) => r[s.key]).filter((v) => v !== null));
  const y1 = Math.max(1, ...ys) * 1.1;
  const X = (v) => L + ((v - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - v / y1) * (H - T - B);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${Y(y1 * p)}" y2="${Y(y1 * p)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(y1 * p) + 4}" text-anchor="end" font-size="11" fill="var(--mut)">${(y1 * p).toFixed(y1 < 10 ? 1 : 0)}</text>`).join('');
  const xt = [0, 0.25, 0.5, 0.75, 1].map((p) => { const v = x0 + (x1 - x0) * p; return `<text x="${X(v)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="var(--mut)">${Math.round(v)}s</text>`; }).join('');
  const lines = series.map((s) => {
    const pts = rows.filter((r) => r[s.key] !== null).map((r) => `${X(r.t_s).toFixed(1)},${Y(r[s.key]).toFixed(1)}`).join(' ');
    return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts}"/>`;
  }).join('');
  const legend = series.map((s, i) => `<g transform="translate(${L + i * 190},14)"><rect width="12" height="3" y="4" fill="${s.color}"/><text x="18" y="9" font-size="12" fill="var(--fg)">${s.label}</text></g>`).join('');
  return `<h2>${title} <small>(${unit})</small></h2><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title}">${grid}${xt}${lines}${legend}</svg>`;
}
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Série temporal do teste de carga</title>
<style>:root{--bg:#fff;--fg:#1c2230;--mut:#5b6478;--line:#dfe3ec}@media (prefers-color-scheme:dark){:root{--bg:#10141c;--fg:#e6e9f0;--mut:#98a2b8;--line:#2a3142}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px}h2{font-size:16px;margin:26px 0 4px}small{color:var(--mut);font-weight:400}pre{background:rgba(127,127,127,.1);padding:12px;border-radius:8px;overflow-x:auto;font-size:12.5px}</style></head><body><main>
<h1>Série temporal do teste de carga</h1>
${chart('Usuários virtuais e vazão', [{ key: 'vus', label: 'VUs ativos', color: '#7c9cff' }, { key: 'rps', label: 'Requisições/s', color: '#4cc38a' }], 'VUs · req/s')}
${chart('Latência', [{ key: 'avg_ms_window', label: 'Média da janela (K6)', color: '#ffb454' }, { key: 'probe_ms', label: 'Sonda /health (externa)', color: '#ff6b78' }], 'ms')}
${chart('CPU e memória', [{ key: 'server_cpu_pct', label: 'Servidor (% de 1 núcleo)', color: '#ff6b78' }, { key: 'k6_cpu_pct', label: 'K6 (% de 1 núcleo)', color: '#7c9cff' }, { key: 'sys_cpu_pct', label: 'Máquina (% total)', color: '#98a2b8' }], '%')}
${chart('Memória do servidor', [{ key: 'server_rss_mb', label: 'RSS', color: '#4cc38a' }], 'MB')}
<h2>Observações automáticas</h2><pre>${obs.map((o) => '- ' + o.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n')}</pre>
</main></body></html>`;
fs.writeFileSync(path.join(outDir, 'timeseries.html'), html, 'utf8');
console.log(`\nGráficos em ${path.join(outDir, 'timeseries.html')}`);
