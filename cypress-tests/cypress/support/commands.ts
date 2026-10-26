import { LoginPage } from './pages/LoginPage';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /**
       * Autentica via interface uma única vez por usuário e reaproveita a sessão (cy.session),
       * deixando cada teste começar já logado sem repetir o fluxo de login.
       */
      loginAs(user?: string): Chainable<void>;
    }
  }
}

Cypress.Commands.add('loginAs', (user = Cypress.env('standardUser') as string) => {
  cy.session(
    ['login', user],
    () => {
      new LoginPage().open().login(user, Cypress.env('password') as string);
      cy.location('pathname').should('eq', '/inventory.html');
    },
    { cacheAcrossSpecs: true }
  );
  cy.visit('/inventory.html', { failOnStatusCode: false });
  cy.get('.title').should('have.text', 'Products');
});

export {};
