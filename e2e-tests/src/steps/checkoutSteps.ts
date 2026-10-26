import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { resolve } from '../support/config';
import { CustomWorld } from '../support/customWorld';
import { LoginPage } from '../pages/LoginPage';
import { ProductsPage } from '../pages/ProductsPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';

Given('que o usuário está autenticado no sistema com {string} e {string}', async function (this: CustomWorld, usuario: string, senha: string) {
  const login = new LoginPage(this.page!);
  await login.open();
  await login.login(resolve(usuario), resolve(senha));
  await expect(this.page!).toHaveURL(/\/inventory\.html$/); // garante o login antes do próximo passo
});

Given('adiciona o produto {string} ao carrinho', async function (this: CustomWorld, produto: string) {
  const products = new ProductsPage(this.page!);
  await products.addProductToCart(produto);
  await expect(products.cartBadge).toHaveText('1'); // o item realmente entrou no carrinho
});

Given('navega até o carrinho de compras e clica em checkout', async function (this: CustomWorld) {
  await new ProductsPage(this.page!).goToCart();
  await expect(this.page!).toHaveURL(/\/cart\.html$/);
  await new CartPage(this.page!).clickCheckout();
  await expect(this.page!).toHaveURL(/\/checkout-step-one\.html$/);
});

When('preenche os dados de entrega com Nome {string}, Sobrenome {string} e CEP {string}', async function (this: CustomWorld, nome: string, sobrenome: string, cep: string) {
  await new CheckoutPage(this.page!).fillInformation(nome, sobrenome, cep);
});

When('clica no botão continuar', async function (this: CustomWorld) {
  await new CheckoutPage(this.page!).clickContinue();
});

When('avança no fluxo e confirma o pedido', async function (this: CustomWorld) {
  const checkout = new CheckoutPage(this.page!);
  await checkout.clickContinue();
  await expect(this.page!).toHaveURL(/\/checkout-step-two\.html$/);
  await checkout.clickFinish();
});

Then('deve visualizar a mensagem de sucesso {string}', async function (this: CustomWorld, mensagemSucesso: string) {
  const checkout = new CheckoutPage(this.page!);
  await expect(this.page!).toHaveURL(/\/checkout-complete\.html$/);
  await expect(checkout.completeHeader).toBeVisible();
  await expect(checkout.completeHeader).toHaveText(mensagemSucesso);
});

Then('deve visualizar a mensagem de erro de checkout {string}', async function (this: CustomWorld, mensagemErro: string) {
  const checkout = new CheckoutPage(this.page!);
  await expect(checkout.errorMessage).toBeVisible();
  await expect(checkout.errorMessage).toContainText(mensagemErro);
  await expect(this.page!).toHaveURL(/\/checkout-step-one\.html$/); // formulário inválido: não avança
});
