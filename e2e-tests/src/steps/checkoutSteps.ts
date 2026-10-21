import { Given, When, Then } from '@cucumber/cucumber';
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
});