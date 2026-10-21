/**
 * Gera reports/RELATORIO-CONSOLIDADO.txt juntando as duas suítes:
 *   - API de exemplo local   (reports/results.json)
 *   - JSONPlaceholder        (reports-jsonplaceholder/results.json)
 * Uso: npm test && npm run test:jsonplaceholder && npm run consolidated
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targets = [
  { nome: 'API de exemplo local (server/server.js)', dir: 'reports' },
  { nome: 'JSONPlaceholder (https://jsonplaceholder.typicode.com)', dir: 'reports-jsonplaceholder' },
];

function load(dir) {
  const p = path.join(root, dir, 'results.json');
  if (!fs.existsSync(p)) return null;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rows = [];
  (function walk(s, titles = []) {
    const t = s.title && !s.title.endsWith('.js') ? [...titles, s.title] : titles;
    for (const spec of s.specs || []) {
      const test = spec.tests[0];
      const r = test.results[test.results.length - 1];
      rows.push({
        describe: t.join(' › '),
        title: spec.title,
        ok: test.status === 'expected',
        ms: r ? r.duration : 0,
        error: r && r.error ? r.error.message.split('\n')[0] : '',
        notes: (test.annotations || []).map((a) => `${a.type}: ${a.description}`),
      });
    }
    for (const c of s.suites || []) walk(c, t);
  })({ suites: data.suites, title: '' });
  return { data, rows };
}

const kind = (r) => (/negativos/i.test(r.describe) ? 'Negativo' : 'Positivo');
const method = (r) => {
  const m = r.describe.match(/^(GET|POST|PUT|PATCH|DELETE)\b/);
  if (m) return m[1];
  if (/Métodos HTTP inválidos/.test(r.describe)) return 'Metodos invalidos';
  if (/Autentica/.test(r.describe)) return 'Autenticacao';
  return 'Outros';
};

const line = '='.repeat(78);
const thin = '-'.repeat(78);
const group = (rows, fn) => {
  const g = {};
  for (const r of rows) {
    const k = fn(r);
    g[k] = g[k] || { n: 0, ok: 0 };
    g[k].n++;
    if (r.ok) g[k].ok++;
  }
  return Object.entries(g)
    .map(([k, v]) => `  ${k.padEnd(24)}${String(v.n).padStart(6)}${String(v.ok).padStart(8)}${String(v.n - v.ok).padStart(9)}`)
    .join('\n');
};
const head = `  ${'Grupo'.padEnd(24)}${'Testes'.padStart(6)}${'Aprov.'.padStart(8)}${'Reprov.'.padStart(9)}`;

let out = `${line}\nRELATORIO CONSOLIDADO - TESTES AUTOMATIZADOS DE API\n${line}\nFerramenta : Playwright (APIRequestContext)\nGerado em  : ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n`;

const loaded = targets.map((t) => ({ ...t, res: load(t.dir) }));
const all = loaded.filter((t) => t.res).flatMap((t) => t.res.rows);

out += `VISAO GERAL\n${thin}\n`;
out += `${'Alvo'.padEnd(58)}${'Testes'.padStart(7)}${'Aprov.'.padStart(7)}${'Reprov.'.padStart(8)}\n`;
for (const t of loaded) {
  if (!t.res) {
    out += `${t.nome.padEnd(58)}  (sem resultados: rode a suite deste alvo)\n`;
    continue;
  }
  const n = t.res.rows.length;
  const ok = t.res.rows.filter((r) => r.ok).length;
  out += `${t.nome.slice(0, 57).padEnd(58)}${String(n).padStart(7)}${String(ok).padStart(7)}${String(n - ok).padStart(8)}\n`;
}
const okAll = all.filter((r) => r.ok).length;
out += `${'TOTAL'.padEnd(58)}${String(all.length).padStart(7)}${String(okAll).padStart(7)}${String(all.length - okAll).padStart(8)}\n\n`;

for (const t of loaded) {
  if (!t.res) continue;
  const { rows, data } = t.res;
  out += `${line}\nALVO: ${t.nome}\n${line}\n`;
  out += `Duracao: ${(data.stats.duration / 1000).toFixed(2)} s | Data: ${new Date(data.stats.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n`;
  out += `Por metodo HTTP\n${head}\n${group(rows, method)}\n\nPositivos x Negativos\n${head}\n${group(rows, kind)}\n\n`;
  out += `Detalhamento\n${thin}\n`;
  rows.forEach((r, i) => {
    out += `[${String(i + 1).padStart(3, '0')}] ${r.ok ? 'PASSOU' : 'FALHOU'} ${kind(r).padEnd(8)} ${r.describe}\n      ${r.title} (${r.ms} ms)\n`;
    for (const n of r.notes) out += `      * ${n}\n`;
    if (!r.ok) out += `      ! ${r.error}\n`;
  });
  const f = rows.filter((r) => !r.ok);
  out += `\nFalhas\n${thin}\n${f.length ? f.map((r) => `- ${r.describe} > ${r.title}\n  ${r.error}`).join('\n') : 'Nenhuma falha.'}\n\n`;
}

// Comparativo: o que cada alvo demonstra nos cenarios negativos
out += `${line}\nCOMPARATIVO DOS CENARIOS NEGATIVOS\n${line}\n`;
out += `A API de exemplo local implementa validacao e autenticacao, entao os testes
negativos verificam REJEICAO (401, 400, 422, 409, 415, 405). O JSONPlaceholder
nao valida nem autentica, entao os testes negativos correspondentes documentam
ACEITACAO (201/200) e os erros de servidor (500) que ele devolve para JSON
malformado e PUT em ID inexistente. Os dois relatorios, juntos, mostram tanto
o comportamento esperado de uma API com tratamento de erros quanto o de uma
API sem ele.\n${line}\n`;

fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
const outPath = path.join(root, 'reports', 'RELATORIO-CONSOLIDADO.txt');
fs.writeFileSync(outPath, out, 'utf8');
console.log(`Consolidado gerado em ${path.relative(root, outPath)} (${okAll}/${all.length} aprovados)`);
