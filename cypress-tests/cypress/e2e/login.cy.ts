import { LoginPage } from '../support/pages/LoginPage';
import { ProductsPage } from '../support/pages/ProductsPage';

describe('Login', () => {
  const login = new LoginPage();

   beforeEach(() => {
    login.open();
  });

  it('usuário válido acessa o catálogo de produtos', () => {
    login.login(Cypress.env('standardUser'), Cypress.env('password'));
    new ProductsPage().shouldBeOpen();
  });

  it('usuário bloqueado vê mensagem de erro e permanece no login', () => {
    login.login(Cypress.env('lockedUser'), Cypress.env('password'));
    login.shouldShowError('Epic sadface: Sorry, this user has been locked out.');
    cy.location('pathname').should('eq', '/');
  });

  // Mesmo cenário, vários dados (equivalente ao "Esquema do Cenário" do Gherkin)
  const invalid = [
    { nome: 'sem usuário', user: '', pass: 'secret_sauce', msg: 'Epic sadface: Username is required' },
    { nome: 'sem senha', user: 'standard_user', pass: '', msg: 'Epic sadface: Password is required' },
    { nome: 'credenciais incorretas', user: 'usuario_inexistente', pass: 'senha_errada', msg: 'Epic sadface: Username and password do not match any user in this service' },
  ];
  invalid.forEach(({ nome, user, pass, msg }) => {
    it(`rejeita login ${nome}`, () => {
      login.login(user, pass);
      login.shouldShowError(msg);
    });
  });

  it('acesso direto a página protegida sem sessão redireciona para o login', () => {
    cy.visit('/inventory.html', { failOnStatusCode: false });
    cy.location('pathname').should('eq', '/');
    cy.get('[data-test="error"]').should('contain.text', "You can only access '/inventory.html' when you are logged in.");
  });
});
