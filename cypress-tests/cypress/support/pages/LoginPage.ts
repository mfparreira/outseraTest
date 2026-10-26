/** Page Object do login. Seletores centralizados aqui; os testes só falam a linguagem do negócio. */
export class LoginPage {
  private readonly username = '[data-test="username"]';
  private readonly password = '[data-test="password"]';
  private readonly submit = '[data-test="login-button"]';
  readonly error = '[data-test="error"]';

  open() {
    cy.visit('/');
    cy.get(this.submit).should('be.visible');
    return this;
  }

  /** Aceita campo vazio: nesse caso não digita nada (cy.type('') falha). */
  login(user: string, pass: string) {
    if (user) cy.get(this.username).type(user);
    if (pass) cy.get(this.password).type(pass, { log: false }); // senha não aparece no log do Cypress
    cy.get(this.submit).click();
    return this;
  }

  shouldShowError(text: string) {
    cy.get(this.error).should('be.visible').and('have.text', text);
  }
}
