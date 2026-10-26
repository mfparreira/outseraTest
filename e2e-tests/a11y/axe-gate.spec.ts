import { test, expect } from '@playwright/test';
import { classify, expectAccessible, scan } from './axe-helper';

/**
 * Prova que o critério de falha funciona (não precisa de rede nem da aplicação):
 * uma página sem acessibilidade DEVE reprovar, uma página correta DEVE passar,
 * e o baseline só tolera o que está justificado.
 */
const INACCESSIBLE = `<html><body>
  <img src="x.png">
  <button></button>
  <input type="text">
</body></html>`;

const ACCESSIBLE = `<!doctype html><html lang="pt-BR"><head><title>Página de teste</title></head>
  <body><main><h1>Título</h1>
    <label for="n">Nome</label><input id="n" type="text">
    <button type="button">Enviar</button>
  </main></body></html>`;

test.describe('Critério de falha do axe (controle)', () => {
  test('página inacessível gera violações bloqueantes (critical/serious)', async ({ page }) => {
    await page.setContent(INACCESSIBLE);
    const c = classify(await scan(page), 'fixture', []);
    const ids = c.blocking.map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']));
  });

  test('expectAccessible reprova a página inacessível', async ({ page }, testInfo) => {
    await page.setContent(INACCESSIBLE);
    await expect(expectAccessible(page, testInfo, 'fixture', [])).rejects.toThrow(/violação|violações/);
    testInfo.annotations.length = 0; // o aviso gerado aqui é esperado; não polui o relatório
  });

  test('página acessível não tem violações bloqueantes', async ({ page }, testInfo) => {
    await page.setContent(ACCESSIBLE);
    const c = await expectAccessible(page, testInfo, 'fixture', []);
    expect(c.blocking).toEqual([]);
  });

  test('baseline com justificativa tolera a regra, e só ela', async ({ page }) => {
    await page.setContent(INACCESSIBLE);
    const results = await scan(page);
    const c = classify(results, 'fixture', [{ page: 'fixture', rule: 'image-alt', reason: 'imagem decorativa legada (ticket #1)' }]);
    expect(c.tolerated.map((v) => v.id)).toEqual(['image-alt']);
    expect(c.blocking.map((v) => v.id)).toEqual(expect.arrayContaining(['button-name', 'label']));
    expect(c.blocking.map((v) => v.id)).not.toContain('image-alt');
  });

  test('baseline de outra página não vale; entrada que não ocorre vira "obsoleta"', async ({ page }) => {
    await page.setContent(ACCESSIBLE);
    const c = classify(await scan(page), 'fixture', [{ page: 'fixture', rule: 'image-alt', reason: 'já corrigido' }]);
    expect(c.stale.map((k) => k.rule)).toEqual(['image-alt']);
    const other = classify(await (async () => { await page.setContent(INACCESSIBLE); return scan(page); })(), 'outra', [{ page: 'fixture', rule: 'image-alt', reason: 'x' }]);
    expect(other.blocking.map((v) => v.id)).toContain('image-alt');
  });
});
