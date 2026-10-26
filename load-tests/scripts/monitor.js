#!/usr/bin/env node
/**
 * Amostrador do teste de carga (Linux). A cada N segundos grava uma linha em timeseries.csv com:
 *   - do k6 (API REST local, localhost:6565): VUs, requisições acumuladas, vazão (req/s),
 *     latência média da janela, p95 acumulado e % de falhas da janela
 *   - sonda externa: tempo de GET /api/health medido por fora do k6 (latência "vista" por outro cliente)
 *   - CPU/memória do servidor da API e do k6, e CPU total da máquina
 *
 * Uso: node scripts/monitor.js <saida.csv> [intervalo_s=1]
 * Variáveis: BASE_URL (alvo da sonda), K6_API (padrão http://localhost:6565),
 *            SERVER_PATTERN (padrão "server/server.js"). Encerra com SIGINT/SIGTERM.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const out = process.argv[2] || 'reports/timeseries.csv';
const intervalMs = Number(process.argv[3] || 1) * 1000;
const K6_API = process.env.K6_API || 'http://localhost:6565';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SERVER_PATTERN = process.env.SERVER_PATTERN || 'server/server.js';
const CLK = 100; // ticks/s (padrão Linux)
const cores = os.cpus().length;

// ---------------------------------------------------------------- processos (/proc)
function findPid(match) {
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    try {
      const cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').filter(Boolean);
      if (cmd.length && match(cmd)) return Number(d);
    } catch (e) {
      /* processo terminou */
    }
  }
  return null;
}
const isServer = (cmd) => cmd.join(' ').includes(SERVER_PATTERN) && !cmd.join(' ').includes('monitor.js');
const isK6 = (cmd) => /(^|\/)k6$/.test(cmd[0]) && cmd[1] === 'run';

const procTicks = (pid) => {
  try {
    const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
    return Number(f[11]) + Number(f[12]); // utime + stime
  } catch (e) {
    return null;
  }
};
const rssMb = (pid) => {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+) kB/);
    return m ? Number(m[1]) / 1024 : null;
  } catch (e) {
    return null;
  }
};
const sysTicks = () => {
  const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
  return { total: f.reduce((a, b) => a + b, 0), idle: f[3] + (f[4] || 0) };
};

// ---------------------------------------------------------------- k6 e sonda
async function k6Metrics() {
  try {
    const res = await fetch(`${K6_API}/v1/metrics`, { signal: AbortSignal.timeout(900) });
    const json = await res.json();
    const m = {};
    for (const d of json.data) m[d.id] = d.attributes.sample;
    return m;
  } catch (e) {
    return null; // k6 ainda não subiu ou já terminou
  }
}
async function probe() {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    await res.arrayBuffer();
    return performance.now() - t0;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- laço de amostragem
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, 't_s,vus,vus_max,reqs_total,rps,avg_ms_window,p95_ms_cumulative,fail_pct_window,probe_ms,server_cpu_pct,server_rss_mb,k6_cpu_pct,sys_cpu_pct,cores\n');

const t0 = Date.now();
let prev = { t: t0, reqs: 0, avg: 0, failRate: 0, srv: null, k6: null, sys: sysTicks(), spid: null, kpid: null };
const f1 = (n, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? '' : n.toFixed(d));

async function tick() {
  const now = Date.now();
  const dt = (now - prev.t) / 1000;
  const [m, probeMs] = await Promise.all([k6Metrics(), probe()]);

  const spid = findPid(isServer);
  const kpid = findPid(isK6);
  const srv = spid ? procTicks(spid) : null;
  const k6 = kpid ? procTicks(kpid) : null;
  const sys = sysTicks();
  const cpu = (cur, before, pid, prevPid) => (cur !== null && before !== null && pid === prevPid && dt > 0 ? ((cur - before) / CLK / dt) * 100 : null);
  const sysPct = (1 - (sys.idle - prev.sys.idle) / (sys.total - prev.sys.total)) * 100;

  let vus = null, vusMax = null, reqs = null, rps = null, avgWin = null, p95 = null, failWin = null;
  if (m) {
    reqs = m.http_reqs ? m.http_reqs.count : 0;
    vus = m.vus ? m.vus.value : null;
    vusMax = m.vus_max ? m.vus_max.value : null;
    const dReq = reqs - prev.reqs;
    rps = dt > 0 ? dReq / dt : null;
    const d = m.http_req_duration;
    if (d && dReq > 0) {
      avgWin = (d.avg * reqs - prev.avg * prev.reqs) / dReq; // média só das requisições da janela
      p95 = d['p(95)'];
    }
    const fr = m.http_req_failed ? m.http_req_failed.rate : 0;
    if (dReq > 0) failWin = Math.max(0, ((fr * reqs - prev.failRate * prev.reqs) / dReq) * 100);
    prev.avg = d ? d.avg : prev.avg;
    prev.failRate = fr;
    prev.reqs = reqs;
  }

  fs.appendFileSync(
    out,
    [
      Math.round((now - t0) / 1000),
      vus === null ? '' : vus,
      vusMax === null ? '' : vusMax,
      reqs === null ? '' : reqs,
      f1(rps),
      f1(avgWin, 2),
      f1(p95, 2),
      f1(failWin, 2),
      f1(probeMs, 2),
      f1(cpu(srv, prev.srv, spid, prev.spid)),
      spid ? f1(rssMb(spid)) : '',
      f1(cpu(k6, prev.k6, kpid, prev.kpid)),
      f1(sysPct),
      cores,
    ].join(',') + '\n'
  );
  prev = { ...prev, t: now, srv, k6, sys, spid, kpid };
}

console.error(`monitor: ${cores} nucleo(s) | k6 API ${K6_API} | gravando em ${out} a cada ${intervalMs / 1000}s`);
let stopped = false;
(async function loop() {
  while (!stopped) {
    const started = Date.now();
    try { await tick(); } catch (e) { /* amostra perdida, segue */ }
    await new Promise((r) => setTimeout(r, Math.max(0, intervalMs - (Date.now() - started))));
  }
})();
const stop = () => { stopped = true; setTimeout(() => process.exit(0), 100); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
