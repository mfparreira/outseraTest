export class CheckoutPage {
  private readonly firstName = '[data-test="firstName"]';
  private readonly lastName = '[data-test="lastName"]';
  private readonly postalCode = '[data-test="postalCode"]';
  private readonly error = '[data-test="error"]';

  startFromCart() {
    cy.get('[data-test="checkout"]').click();
    cy.location('pathname').should('eq', '/checkout-step-one.html');
  }

  fill(first: string, last: string, zip: string) {
    if (first) cy.get(this.firstName).type(first);
    if (last) cy.get(this.lastName).type(last);
    if (zip) cy.get(this.postalCode).type(zip);
    return this;
  }

  continue() {
    cy.get('[data-test="continue"]').click();
    return this;
  }

  finish() {
    cy.location('pathname').should('eq', '/checkout-step-two.html');
    cy.get('[data-test="finish"]').click();
  }

  shouldShowError(text: string) {
    cy.get(this.error).should('be.visible').and('have.text', text);
  }

  shouldBeCompleted() {
    cy.location('pathname').should('eq', '/checkout-complete.html');
    cy.get('[data-test="complete-header"]').should('have.text', 'Thank you for your order!');
  }
}
