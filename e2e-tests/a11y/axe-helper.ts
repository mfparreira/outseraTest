import AxeBuilder from '@axe-core/playwright';
import { Page, TestInfo, expect } from '@playwright/test';
import type { AxeResults, Result } from 'axe-core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Critério de falha da suíte de acessibilidade:
 *   - FALHA o teste se houver violação WCAG com impacto em A11Y_FAIL_ON (padrão: critical,serious)
 *     que NÃO esteja no baseline (a11y/known-issues.json);
 *   - violações de menor impacto e as toleradas pelo baseline entram no relatório como aviso.
 */
export const FAIL_ON: string[] = (process.env.A11Y_FAIL_ON || 'critical,serious')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TAGS = (process.env.A11Y_TAGS || 'wcag2a,wcag2aa,wcag21a,wcag21aa').split(',').map((s) => s.trim());

export interface KnownIssue {
  page: string; // nome da jornada/página, igual ao usado em expectAccessible()
  rule: string; // id da regra do axe, ex.: "color-contrast"
  reason: string; // por que é aceito (obrigatório: baseline sem justificativa não vale)
}

export function loadBaseline(file = process.env.A11Y_BASELINE || path.join(__dirname, 'known-issues.json')): KnownIssue[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { issues: KnownIssue[] };
  for (const i of raw.issues) {
    if (!i.page || !i.rule || !i.reason || !i.reason.trim()) {
      throw new Error(`known-issues.json: toda entrada precisa de page, rule e reason (inválida: ${JSON.stringify(i)})`);
    }
  }
  return raw.issues;
}

export interface Classified {
  blocking: Result[]; // derrubam o teste
  tolerated: Result[]; // impacto alto, mas aceitas no baseline
  advisory: Result[]; // impacto abaixo do critério de falha
  stale: KnownIssue[]; // entradas do baseline que não ocorrem mais (podem ser removidas)
}

export function classify(results: Pick<AxeResults, 'violations'>, pageName: string, baseline: KnownIssue[], failOn = FAIL_ON): Classified {
  const known = baseline.filter((b) => b.page === pageName);
  const out: Classified = { blocking: [], tolerated: [], advisory: [], stale: [] };
  for (const v of results.violations) {
    if (!failOn.includes(v.impact || '')) out.advisory.push(v);
    else if (known.some((k) => k.rule === v.id)) out.tolerated.push(v);
    else out.blocking.push(v);
  }
  out.stale = known.filter((k) => !results.violations.some((v) => v.id === k.rule));
  return out;
}

export function describe(v: Result): string {
  const targets = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ');
  const more = v.nodes.length > 3 ? ` (+${v.nodes.length - 3})` : '';
  return `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.length} elemento(s): ${targets}${more}\n    ${v.helpUrl}`;
}

export async function scan(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/**
 * Roda o axe na página atual e falha se houver violação bloqueante.
 * Anexa o resultado completo (JSON) ao relatório e registra avisos como anotações.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo, pageName: string, baseline = loadBaseline()): Promise<Classified> {
  const results = await scan(page);
  const c = classify(results, pageName, baseline);

  await testInfo.attach(`axe-${pageName}.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' });
  for (const v of c.advisory) testInfo.annotations.push({ type: 'a11y aviso', description: describe(v).split('\n')[0] });
  for (const v of c.tolerated) testInfo.annotations.push({ type: 'a11y tolerada (baseline)', description: describe(v).split('\n')[0] });
  for (const k of c.stale) testInfo.annotations.push({ type: 'a11y baseline obsoleto', description: `${k.page}/${k.rule}: não ocorre mais, remova de known-issues.json` });

  const msg = c.blocking.length
    ? `${c.blocking.length} violação(ões) de acessibilidade (${FAIL_ON.join('/')}) em "${pageName}":\n\n${c.blocking.map(describe).join('\n\n')}\n`
    : '';
  // Compara a contagem (e não os objetos) para o relatório mostrar só a mensagem, sem um diff enorme do axe
  expect(c.blocking.length, msg).toBe(0);
  return c;
}
