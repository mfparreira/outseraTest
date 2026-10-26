import { test, expect, Page } from '@playwright/test';
import { config } from '../src/support/config';
import { LoginPage } from '../src/pages/LoginPage';
import { ProductsPage } from '../src/pages/ProductsPage';
import { CartPage } from '../src/pages/CartPage';
import { CheckoutPage } from '../src/pages/CheckoutPage';
import { expectAccessible } from './axe-helper';

/**
 * Acessibilidade (axe-core) nas jornadas críticas: entrar, escolher produto e concluir a compra.
 * Cada teste varre uma tela no estado em que o usuário realmente a vê.
 * Violações critical/serious (fora do baseline) reprovam o teste.
 */
const { standard, password } = config.users;

async function loginAsStandard(page: Page) {
  const login = new LoginPage(page);
  await login.open();
  await login.login(standard, password);
  await expect(page).toHaveURL(/\/inventory\.html$/);
}

async function openCheckoutStepOne(page: Page) {
  await loginAsStandard(page);
  const products = new ProductsPage(page);
  await products.addProductToCart('Sauce Labs Backpack');
  await expect(products.cartBadge).toHaveText('1');
  await products.goToCart();
  await new CartPage(page).clickCheckout();
  await expect(page).toHaveURL(/\/checkout-step-one\.html$/);
}

test.describe('Jornada de login', () => {
  test('página de login', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    await login.open();
    await expect(login.loginButton).toBeVisible();
    await expectAccessible(page, testInfo, 'login');
  });

  test('login com erro exibido', async ({ page }, testInfo) => {
    const login = new LoginPage(page);
    await login.open();
    await login.login('invalid_user', 'wrong_pass');
    await expect(login.errorMessage).toBeVisible(); // o estado de erro também precisa ser acessível
    await expectAccessible(page, testInfo, 'login-erro');
  });
});

test.describe('Jornada de compra', () => {
  test('catálogo de produtos', async ({ page }, testInfo) => {
    await loginAsStandard(page);
    await expect(new ProductsPage(page).title).toHaveText('Products');
    await expectAccessible(page, testInfo, 'produtos');
  });

  test('carrinho com item', async ({ page }, testInfo) => {
    await loginAsStandard(page);
    const products = new ProductsPage(page);
    await products.addProductToCart('Sauce Labs Backpack');
    await products.goToCart();
    await expect(page).toHaveURL(/\/cart\.html$/);
    await expectAccessible(page, testInfo, 'carrinho');
  });

  test('checkout: dados de entrega', async ({ page }, testInfo) => {
    await openCheckoutStepOne(page);
    await expectAccessible(page, testInfo, 'checkout-dados');
  });

  test('checkout: erro de validação do formulário', async ({ page }, testInfo) => {
    await openCheckoutStepOne(page);
    const checkout = new CheckoutPage(page);
    await checkout.clickContinue();
    await expect(checkout.errorMessage).toBeVisible();
    await expectAccessible(page, testInfo, 'checkout-erro');
  });

  test('checkout: revisão do pedido', async ({ page }, testInfo) => {
    await openCheckoutStepOne(page);
    const checkout = new CheckoutPage(page);
    await checkout.fillInformation('João', 'Silva', '12345-678');
    await checkout.clickContinue();
    await expect(page).toHaveURL(/\/checkout-step-two\.html$/);
    await expectAccessible(page, testInfo, 'checkout-revisao');
  });

  test('confirmação do pedido', async ({ page }, testInfo) => {
    await openCheckoutStepOne(page);
    const checkout = new CheckoutPage(page);
    await checkout.fillInformation('João', 'Silva', '12345-678');
    await checkout.clickContinue();
    await checkout.clickFinish();
    await expect(checkout.completeHeader).toHaveText('Thank you for your order!');
    await expectAccessible(page, testInfo, 'checkout-confirmacao');
  });
});
