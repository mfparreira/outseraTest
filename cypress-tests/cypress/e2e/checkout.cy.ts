import { ProductsPage } from '../support/pages/ProductsPage';
import { CheckoutPage } from '../support/pages/CheckoutPage';

describe('Compra (checkout)', () => {
  const products = new ProductsPage();
  const checkout = new CheckoutPage();

  beforeEach(() => {
    cy.loginAs(); // sessão reaproveitada
    products.add('Sauce Labs Backpack');
    cy.get(products.cartBadge).should('have.text', '1');
    products.goToCart();
    checkout.startFromCart();
  });

  it('conclui a compra com dados válidos', () => {
    checkout.fill('João', 'Silva', '12345-678').continue().finish();
    checkout.shouldBeCompleted();
  });

  const required = [
    { campo: 'nome', dados: ['', 'Silva', '12345-678'], msg: 'Error: First Name is required' },
    { campo: 'sobrenome', dados: ['João', '', '12345-678'], msg: 'Error: Last Name is required' },
    { campo: 'CEP', dados: ['João', 'Silva', ''], msg: 'Error: Postal Code is required' },
  ] as const;
  required.forEach(({ campo, dados, msg }) => {
    it(`bloqueia o avanço sem ${campo}`, () => {
      const [nome, sobrenome, cep] = dados;
      checkout.fill(nome, sobrenome, cep).continue();
      checkout.shouldShowError(msg);
      cy.location('pathname').should('eq', '/checkout-step-one.html');
    });
  });
});