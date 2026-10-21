/**
 * Lê reports/results.json (gerado pelo Playwright) e produz reports/RELATORIO.md
 * com totais, quebra por método HTTP / tipo de cenário e a lista de todos os testes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// Uso: node scripts/generate-summary.js [pasta-de-relatorios]   (padrão: reports)
const reportDir = process.argv[2] || 'reports';
const resultsPath = path.join(root, reportDir, 'results.json');
const outPath = path.join(root, reportDir, 'RELATORIO.md');

const data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const rows = [];
function walk(suite, titles = []) {
  const t = suite.title && !suite.title.endsWith('.js') ? [...titles, suite.title] : titles;
  for (const spec of suite.specs || []) {
    const result = spec.tests[0].results[0];
    const describe = t.join(' › ');
    rows.push({
      file: suite.file || '',
      describe,
      title: spec.title,
      status: spec.tests[0].status, // expected | unexpected | flaky | skipped
      duration: result ? result.duration : 0,
      error: result && result.error ? result.error.message.split('\n')[0] : '',
      notes: (spec.tests[0].annotations || []).map((a) => `${a.type}: ${a.description}`),
    });
  }
  for (const child of suite.suites || []) walk(child, t);
}
for (const s of data.suites) walk(s);

const kind = (r) => (/negativos/i.test(r.describe) ? 'Negativo' : 'Positivo');
const method = (r) => {
  const m = r.describe.match(/^(GET|POST|PUT|PATCH|DELETE)\b/);
  if (m) return m[1];
  if (/Métodos HTTP inválidos/.test(r.describe)) return 'Métodos inválidos';
  if (/Autenticação/.test(r.describe)) return 'Auth (rotas protegidas)';
  return 'Outros';
};
const passed = (r) => r.status === 'expected';

const total = rows.length;
const ok = rows.filter(passed).length;
const fail = total - ok;
const totalMs = rows.reduce((a, r) => a + r.duration, 0);

function table(keyFn) {
  const groups = {};
  for (const r of rows) {
    const k = keyFn(r);
    groups[k] = groups[k] || { total: 0, ok: 0 };
    groups[k].total++;
    if (passed(r)) groups[k].ok++;
  }
  return Object.entries(groups)
    .map(([k, v]) => `| ${k} | ${v.total} | ${v.ok} | ${v.total - v.ok} |`)
    .join('\n');
}

let md = `# Relatório de Testes Automatizados de API

- **Ferramenta:** Playwright (APIRequestContext)
- **Alvo:** ${process.env.API_BASE_URL || (reportDir.includes('jsonplaceholder') ? 'https://jsonplaceholder.typicode.com' : 'API de exemplo local (server/server.js)')}
- **Data:** ${new Date(data.stats.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
- **Duração total:** ${(data.stats.duration / 1000).toFixed(2)} s

## Resumo

| Total | Aprovados | Reprovados | Taxa de sucesso |
|---|---|---|---|
| ${total} | ${ok} | ${fail} | ${((ok / total) * 100).toFixed(1)}% |

## Por método HTTP

| Grupo | Testes | Aprovados | Reprovados |
|---|---|---|---|
${table(method)}

## Positivos x Negativos

| Tipo | Testes | Aprovados | Reprovados |
|---|---|---|---|
${table(kind)}

## Detalhamento

| # | Grupo | Cenário | Tipo | Resultado | Tempo (ms) |
|---|---|---|---|---|---|
`;

rows.forEach((r, i) => {
  md += `| ${i + 1} | ${r.describe} | ${r.title} | ${kind(r)} | ${passed(r) ? '✅ PASSOU' : '❌ FALHOU'} | ${r.duration} |\n`;
});

const failures = rows.filter((r) => !passed(r));
md += `\n## Falhas\n\n`;
md += failures.length
  ? failures.map((r) => `- **${r.describe} › ${r.title}**: ${r.error}`).join('\n')
  : 'Nenhuma falha.';
md += '\n';

fs.writeFileSync(outPath, md);

// ---------- Versão em texto puro (.txt) ----------
const txtPath = path.join(root, reportDir, 'RELATORIO.txt');
const line = '='.repeat(78);
const thin = '-'.repeat(78);

function txtGroups(keyFn) {
  const groups = {};
  for (const r of rows) {
    const k = keyFn(r);
    groups[k] = groups[k] || { total: 0, ok: 0 };
    groups[k].total++;
    if (passed(r)) groups[k].ok++;
  }
  const head = `${'Grupo'.padEnd(28)}${'Testes'.padStart(8)}${'Aprov.'.padStart(8)}${'Reprov.'.padStart(9)}`;
  const body = Object.entries(groups).map(
    ([k, v]) =>
      `${k.padEnd(28)}${String(v.total).padStart(8)}${String(v.ok).padStart(8)}${String(v.total - v.ok).padStart(9)}`
  );
  return [head, ...body].join('\n');
}

const alvo =
  process.env.API_BASE_URL ||
  (reportDir.includes('jsonplaceholder') ? 'https://jsonplaceholder.typicode.com' : 'API de exemplo local (server/server.js)');

let txt = `${line}
RELATORIO DE TESTES AUTOMATIZADOS DE API
${line}
Ferramenta : Playwright (APIRequestContext)
Alvo       : ${alvo}
Data       : ${new Date(data.stats.startTime).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
Duracao    : ${(data.stats.duration / 1000).toFixed(2)} s

RESUMO
${thin}
Total      : ${total}
Aprovados  : ${ok}
Reprovados : ${fail}
Sucesso    : ${((ok / total) * 100).toFixed(1)}%

POR METODO HTTP
${thin}
${txtGroups(method)}

POSITIVOS x NEGATIVOS
${thin}
${txtGroups(kind)}

DETALHAMENTO
${thin}
`;

rows.forEach((r, i) => {
  txt += `[${String(i + 1).padStart(3, '0')}] ${passed(r) ? 'PASSOU ' : 'FALHOU '} ${kind(r).padEnd(8)} ${r.describe}\n`;
  txt += `      ${r.title} (${r.duration} ms)\n`;
  for (const n of r.notes) txt += `      * ${n}\n`;
  if (!passed(r)) txt += `      ! ${r.error}\n`;
});

txt += `\nFALHAS\n${thin}\n`;
txt += failures.length
  ? failures.map((r) => `- ${r.describe} > ${r.title}\n  ${r.error}`).join('\n')
  : 'Nenhuma falha.';
txt += `\n${line}\n`;

fs.writeFileSync(txtPath, txt, 'utf8');
console.log(`Relatórios gerados em ${path.relative(root, outPath)} e ${path.relative(root, txtPath)} (${ok}/${total} aprovados)`);
