import { Given, When, Then } from '@cucumber/cucumber';
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
});