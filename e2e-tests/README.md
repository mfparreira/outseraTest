# Automação E2E com Playwright + Cucumber (BDD)

Testes de ponta a ponta no [SauceDemo](https://www.saucedemo.com/): Cucumber.js (BDD, Gherkin em português) + Playwright + TypeScript, com Page Object Model.
Esta pasta também contém a suíte de **acessibilidade** (axe-core), que reaproveita as mesmas páginas e configuração.

## Executar

```bash
npm ci
npx playwright install chromium
npm test              # janela visível (local)
npm run test:ci       # headless + JUnit, como no CI
npm run test:a11y     # acessibilidade (axe)
```
Relatórios em `reports/` (`cucumber-report.html`/`.json`, screenshots, `traces/`, `a11y/`).

## Configuração (nada fixo no código)

Tudo vem de **variáveis de ambiente** ou de um `.env` local (veja `.env.example`), lidas em um único lugar: `src/support/config.ts`.

| Variável | Padrão | Uso |
|---|---|---|
| `E2E_BASE_URL` | `https://www.saucedemo.com` | URL da aplicação |
| `E2E_STANDARD_USER` / `E2E_LOCKED_USER` / `E2E_PASSWORD` | contas públicas do SauceDemo | credenciais |
| `E2E_HEADLESS` | `true` se `CI=true` | navegador sem janela |
| `E2E_BROWSER_PATH` | vazio | usar um Chromium/Chrome já instalado |
| `E2E_ACTION_TIMEOUT_MS` / `E2E_EXPECT_TIMEOUT_MS` / `E2E_STEP_TIMEOUT_MS` | 10000 / 7000 / 60000 | timeouts |
| `E2E_TRACE` / `E2E_SCREENSHOT` | `on-failure` / `always` | evidências (`always`, `on-failure`, `off`) |

Nos `.feature`, credenciais aparecem como `${STANDARD_USER}`, `${LOCKED_USER}` e `${PASSWORD}` e são resolvidas em tempo de execução
(não ficam no Gherkin nem nos relatórios). No CI: *Settings → Secrets and variables → Actions* (`E2E_PASSWORD` como *secret*, o resto como *variables*).

## Gerenciamento do navegador

- **Um `Browser` por suíte** (aberto em `BeforeAll`, fechado em `AfterAll`) e **um `BrowserContext` novo por cenário** (`Before`/`After`):
  isolamento total de cookies/sessão/storage sem pagar o custo de abrir um navegador a cada cenário.
- **Playwright Trace só dos cenários que falharam** (`reports/traces/<cenário>.zip`, com screenshots e snapshots do DOM).
  Para abrir: `npx playwright show-trace reports/traces/<arquivo>.zip`.

## Assertions

Validações usam `expect(locator)` do Playwright (`toHaveText`, `toHaveURL`, `toBeVisible`), que **esperam automaticamente** até o timeout configurado,
em vez de extrair o texto/estado e comparar depois (padrão que gera flakiness). Os Page Objects expõem `Locator`s, não valores já lidos.

## Acessibilidade (axe-core)

`a11y/journeys.spec.ts` varre 8 telas das jornadas críticas (login, erro de login, catálogo, carrinho, dados de entrega, erro de validação, revisão e confirmação).

- **Critério de falha:** qualquer violação WCAG 2.0/2.1 A/AA com impacto `critical` ou `serious` reprova o teste (`A11Y_FAIL_ON`, `A11Y_TAGS` ajustam). Impacto menor vira *aviso* no relatório.
- **Baseline:** `a11y/known-issues.json` permite tolerar uma violação conhecida, **somente com `page`, `rule` e `reason` (justificativa)**; entradas sem justificativa derrubam a suíte,
  e entradas que deixam de ocorrer são sinalizadas como obsoletas. Está vazio.
- `a11y/axe-gate.spec.ts` prova que o critério funciona (página ruim reprova, página boa passa, baseline só tolera o justificado).
- Cada teste anexa o JSON completo do axe ao relatório HTML.
- Limitação: o axe automatizado encontra ~30–50 % dos problemas de acessibilidade; não substitui revisão manual (teclado, leitor de tela).
