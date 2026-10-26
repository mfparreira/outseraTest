import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { resolve } from '../support/config';
import { CustomWorld } from '../support/customWorld';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';

Given('que o usuário navega até a página inicial do SauceDemo', async function (this: CustomWorld) {
  await new LoginPage(this.page!).open();
});

// ${STANDARD_USER}, ${LOCKED_USER} e ${PASSWORD} são resolvidos a partir da configuração (config.ts)
When('insere o usuário {string} e a senha {string}', async function (this: CustomWorld, usuario: string, senha: string) {
  await new LoginPage(this.page!).fillCredentials(resolve(usuario), resolve(senha));
});

When('clica no botão de login', async function (this: CustomWorld) {
  await new LoginPage(this.page!).clickLogin();
});

Then('deve ser redirecionado para a página de produtos com o título {string}', async function (this: CustomWorld, tituloEsperado: string) {
  const products = new ProductsPage(this.page!);
  // Assertions de Locator/Page: esperam automaticamente (auto-wait) até passar ou estourar o timeout
  await expect(this.page!).toHaveURL(/\/inventory\.html$/);
  await expect(products.title).toHaveText(tituloEsperado);
});

Then('deve visualizar a mensagem de erro {string}', async function (this: CustomWorld, mensagemErroEsperada: string) {
  const login = new LoginPage(this.page!);
  await expect(login.errorMessage).toBeVisible();
  // toContainText: o contêiner do erro pode ter elementos extras (ex.: botão de fechar)
  await expect(login.errorMessage).toContainText(mensagemErroEsperada);
  await expect(this.page!).not.toHaveURL(/inventory\.html/); // login recusado: continua fora da área logada
});
