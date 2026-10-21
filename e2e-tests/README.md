# Automação E2E com Playwright + Cucumber (BDD)

Este projeto realiza testes de ponta a ponta na plataforma [SauceDemo](https://www.saucedemo.com/) como avaliação técnica de automação de testes.

## 🛠️ Tecnologias Utilizadas
- **Playwright** - Automação do navegador
- **Cucumber.js** - Framework BDD
- **TypeScript** - Tipagem estática
- **Page Object Model (POM)** - Padrão de arquitetura de código

## 🚀 Como Executar

### 1. Instalar dependências
```bash
npm install
npx playwright install
```

### 2. Executar os testes e gerar relatório
```bash
npm run report
```

O relatório em HTML contendo evidências (screenshots) será gerado em: `reports/cucumber-report.html`.