# Cypress (mini-suíte)

Cenários representativos do SauceDemo (não duplicam toda a suíte Playwright): login positivo/negativo/parametrizado,
proteção de rota, e checkout (sucesso + campos obrigatórios).

Arquitetura: `cypress/support/pages/*` (Page Objects, seletores em um só lugar) · `cypress/support/commands.ts`
(`cy.loginAs()` com `cy.session`) · `cypress/e2e/*.cy.ts` (só linguagem de negócio) · `cypress.config.ts`
(URL, credenciais e timeouts por variáveis de ambiente: `E2E_BASE_URL`, `E2E_STANDARD_USER`, `E2E_PASSWORD`...).

```bash
npm ci
npm test            # headless (Electron)
npm run test:ci     # Chrome, como no CI
npm run cy:open     # modo interativo
```
Saídas em `reports/`: `junit/*.xml`, `cypress-summary.json`, `screenshots/` (apenas falhas).
