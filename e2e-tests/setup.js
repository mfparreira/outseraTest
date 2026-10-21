const fs = require('fs');
const path = require('path');

const files = {
  // CONFIGURAÇÕES
  'package.json': `{
  "name": "e2e-saucedemo-cucumber",
  "version": "1.0.0",
  "description": "Testes E2E com Playwright e Cucumber no SauceDemo",
  "main": "index.js",
  "scripts": {
    "test": "cucumber-js",
    "report": "cucumber-js --format html:reports/cucumber-report.html"
  },
  "devDependencies": {
    "@cucumber/cucumber": "^10.0.0",
    "@playwright/test": "^1.40.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.1",
    "typescript": "^5.0.0"
  }
}`,

  'cucumber.js': `module.exports = {
  default: {
    paths: ['.features/**/*.feature'],
    requireModule: ['ts-node/register'],
    require: ['src/steps/**/*.ts', 'src/support/**/*.ts'],
    format: [
      'progress',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json'
    ],
    parallel: 1
  }
};`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}`,

  '.gitignore': `node_modules/
reports/
.playwright-artifacts/
`,

  // FEATURES
  '.features/01_login.feature': `# language: pt
Funcionalidade: Autenticação de Usuário
  Como um usuário da plataforma SauceDemo
  Quero realizar login no sistema
  Para acessar a lista de produtos

  Contexto:
    Dado que o usuário navega até a página inicial do SauceDemo

  Cenário: Login bem-sucedido (Fluxo Positivo)
    Quando insere o usuário "standard_user" e a senha "secret_sauce"
    E clica no botão de login
    Então deve ser redirecionado para a página de produtos com o título "Products"

  Esquema do Cenário: Tentativas de login inválidas (Fluxos Negativos)
    Quando insere o usuário "<usuario>" e a senha "<senha>"
    E clica no botão de login
    Então deve visualizar a mensagem de erro "<mensagem_erro>"

    Exemplos:
      | usuario         | senha        | mensagem_erro                                                              |
      | locked_out_user | secret_sauce | Epic sadface: Sorry, this user has been locked out.                        |
      | invalid_user    | secret_sauce | Epic sadface: Username and password do not match any user in this service |
      | standard_user   | wrong_pass   | Epic sadface: Username and password do not match any user in this service |
      |                 | secret_sauce | Epic sadface: Username is required                                         |
      | standard_user   |              | Epic sadface: Password is required                                         |
`,

  '.features/02_checkout.feature': `# language: pt
Funcionalidade: Fluxo de Checkout no E-commerce
  Como um cliente logado na plataforma
  Quero adicionar produtos ao carrinho e realizar o checkout
  Para concluir a minha compra

  Contexto:
    Dado que o usuário está autenticado no sistema com "standard_user" e "secret_sauce"
    E adiciona o produto "Sauce Labs Backpack" ao carrinho
    E navega até o carrinho de compras e clica em checkout

  Cenário: Finalização de compra com sucesso (Fluxo Positivo)
    Quando preenche os dados de entrega com Nome "João", Sobrenome "Silva" e CEP "12345-678"
    E avança no fluxo e confirma o pedido
    Então deve visualizar a mensagem de sucesso "Thank you for your order!"

  Esquema do Cenário: Validação de campos obrigatórios no formulário de entrega (Fluxos Negativos)
    Quando preenche os dados de entrega com Nome "<nome>", Sobrenome "<sobrenome>" e CEP "<cep>"
    E clica no botão continuar
    Então deve visualizar a mensagem de erro de checkout "<mensagem_erro>"

    Exemplos:
      | nome | sobrenome | cep       | mensagem_erro                  |
      |      | Silva     | 12345-678 | Error: First Name is required  |
      | João |           | 12345-678 | Error: Last Name is required   |
      | João | Silva     |           | Error: Postal Code is required |
`,

  // PAGES (POM)
  'src/pages/LoginPage.ts': `import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('[data-test="username"]');
    this.passwordInput = page.locator('[data-test="password"]');
    this.loginButton = page.locator('[data-test="login-button"]');
    this.errorMessage = page.locator('[data-test="error"]');
  }

  async navigateTo() {
    await this.page.goto('https://www.saucedemo.com/');
  }

  async fillCredentials(username?: string, password?: string) {
    if (username) await this.usernameInput.fill(username);
    if (password) await this.passwordInput.fill(password);
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }
}`,

  'src/pages/ProductsPage.ts': `import { Page, Locator } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly title: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator('.title');
    this.cartBadge = page.locator('.shopping_cart_badge');
  }

  async getTitleText(): Promise<string> {
    return (await this.title.textContent()) || '';
  }

  async addProductToCart(productName: string) {
    const formattedName = productName.toLowerCase().replace(/\\s+/g, '-');
    await this.page.click(\`[data-test="add-to-cart-\${formattedName}"]\`);
  }

  async goToCart() {
    await this.page.click('.shopping_cart_link');
  }
}`,

  'src/pages/CartPage.ts': `import { Page, Locator } from '@playwright/test';

export class CartPage {
  readonly page: Page;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.checkoutButton = page.locator('[data-test="checkout"]');
  }

  async clickCheckout() {
    await this.checkoutButton.click();
  }
}`,

  'src/pages/CheckoutPage.ts': `import { Page, Locator } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly postalCodeInput: Locator;
  readonly continueButton: Locator;
  readonly finishButton: Locator;
  readonly errorMessage: Locator;
  readonly completeHeader: Locator;

  constructor(page: Page) {
    this.page = page;
    this.firstNameInput = page.locator('[data-test="firstName"]');
    this.lastNameInput = page.locator('[data-test="lastName"]');
    this.postalCodeInput = page.locator('[data-test="postalCode"]');
    this.continueButton = page.locator('[data-test="continue"]');
    this.finishButton = page.locator('[data-test="finish"]');
    this.errorMessage = page.locator('[data-test="error"]');
    this.completeHeader = page.locator('.complete-header');
  }

  async fillInformation(firstName?: string, lastName?: string, postalCode?: string) {
    if (firstName) await this.firstNameInput.fill(firstName);
    if (lastName) await this.lastNameInput.fill(lastName);
    if (postalCode) await this.postalCodeInput.fill(postalCode);
  }

  async clickContinue() {
    await this.continueButton.click();
  }

  async clickFinish() {
    await this.finishButton.click();
  }

  async getErrorMessage(): Promise<string> {
    return (await this.errorMessage.textContent()) || '';
  }

  async getConfirmationMessage(): Promise<string> {
    return (await this.completeHeader.textContent()) || '';
  }
}`,

  // STEPS
  'src/steps/loginSteps.ts': `import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/customWorld';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';

Given('que o usuário navega até a página inicial do SauceDemo', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.navigateTo();
});

When('insere o usuário {string} e a senha {string}', async function (this: CustomWorld, usuario: string, senha: string) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.fillCredentials(usuario, senha);
});

When('clica no botão de login', async function (this: CustomWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.clickLogin();
});

Then('deve ser redirecionado para a página de produtos com o título {string}', async function (this: CustomWorld, tituloEsperado: string) {
  const productsPage = new ProductsPage(this.page!);
  const title = await productsPage.getTitleText();
  expect(title).toBe(tituloEsperado);
});

Then('deve visualizar a mensagem de erro {string}', async function (this: CustomWorld, mensagemErroEsperada: string) {
  const loginPage = new LoginPage(this.page!);
  const erro = await loginPage.getErrorMessage();
  expect(erro).toContain(mensagemErroEsperada);
});`,

  'src/steps/checkoutSteps.ts': `import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../support/customWorld';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';

Given('que o usuário está autenticado no sistema com {string} e {string}', async function (this: CustomWorld, usuario: string, senha: string) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.navigateTo();
  await loginPage.fillCredentials(usuario, senha);
  await loginPage.clickLogin();
});

Given('adiciona o produto {string} ao carrinho', async function (this: CustomWorld, produto: string) {
  const productsPage = new ProductsPage(this.page!);
  await productsPage.addProductToCart(produto);
});

Given('navega até o carrinho de compras e clica em checkout', async function (this: CustomWorld) {
  const productsPage = new ProductsPage(this.page!);
  const cartPage = new CartPage(this.page!);
  await productsPage.goToCart();
  await cartPage.clickCheckout();
});

When('preenche os dados de entrega com Nome {string}, Sobrenome {string} e CEP {string}', async function (this: CustomWorld, nome: string, sobrenome: string, cep: string) {
  const checkoutPage = new CheckoutPage(this.page!);
  await checkoutPage.fillInformation(nome, sobrenome, cep);
});

When('clica no botão continuar', async function (this: CustomWorld) {
  const checkoutPage = new CheckoutPage(this.page!);
  await checkoutPage.clickContinue();
});

When('avança no fluxo e confirma o pedido', async function (this: CustomWorld) {
  const checkoutPage = new CheckoutPage(this.page!);
  await checkoutPage.clickContinue();
  await checkoutPage.clickFinish();
});

Then('deve visualizar a mensagem de sucesso {string}', async function (this: CustomWorld, mensagemSucesso: string) {
  const checkoutPage = new CheckoutPage(this.page!);
  const mensagem = await checkoutPage.getConfirmationMessage();
  expect(mensagem).toContain(mensagemSucesso);
});

Then('deve visualizar a mensagem de erro de checkout {string}', async function (this: CustomWorld, mensagemErro: string) {
  const checkoutPage = new CheckoutPage(this.page!);
  const erro = await checkoutPage.getErrorMessage();
  expect(erro).toContain(mensagemErro);
});`,

  // SUPPORT
  'src/support/customWorld.ts': `import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page } from '@playwright/test';

export interface CustomWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
}

export class CustomWorldConstructor extends World implements CustomWorld {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(CustomWorldConstructor);`,

  'src/support/hooks.ts': `import { Before, After } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import { CustomWorld } from './customWorld';
import * as fs from 'fs';
import * as path from 'path';

Before(async function (this: CustomWorld) {
  this.browser = await chromium.launch({ headless: false });
  this.context = await this.browser.newContext();
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld, scenario) {
  if (this.page) {
    const screenshotDir = path.join(process.cwd(), 'reports', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const fileName = \`\${scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '_')}.png\`;
    const screenshotPath = path.join(screenshotDir, fileName);
    
    const screenshot = await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.attach(screenshot, 'image/png');
  }

  await this.page?.close();
  await this.context?.close();
  await this.browser?.close();
});`,

  'README.md': `# Automação E2E com Playwright + Cucumber (BDD)

Este projeto realiza testes de ponta a ponta na plataforma [SauceDemo](https://www.saucedemo.com/) como avaliação técnica de automação de testes.

## 🛠️ Tecnologias Utilizadas
- **Playwright** - Automação do navegador
- **Cucumber.js** - Framework BDD
- **TypeScript** - Tipagem estática
- **Page Object Model (POM)** - Padrão de arquitetura de código

## 🚀 Como Executar

### 1. Instalar dependências
\`\`\`bash
npm install
npx playwright install
\`\`\`

### 2. Executar os testes e gerar relatório
\`\`\`bash
npm run report
\`\`\`

O relatório em HTML contendo evidências (screenshots) será gerado em: \`reports/cucumber-report.html\`.
`
};

// Criação dos arquivos e diretórios
Object.entries(files).forEach(([filePath, content]) => {
  const absolutePath = path.join(__dirname, filePath);
  const dir = path.dirname(absolutePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(absolutePath, content.trim(), 'utf8');
  console.log(`[✔] Criado: ${filePath}`);
});

console.log('\n✨ Projeto gerado com sucesso!');