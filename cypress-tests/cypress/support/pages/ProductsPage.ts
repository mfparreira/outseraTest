export class ProductsPage {
  private readonly title = '.title';
  readonly cartBadge = '.shopping_cart_badge';
  private readonly cartLink = '.shopping_cart_link';

  private addButton(product: string) {
    return `[data-test="add-to-cart-${product.toLowerCase().replace(/\s+/g, '-')}"]`;
  }

  shouldBeOpen() {
    cy.location('pathname').should('eq', '/inventory.html');
    cy.get(this.title).should('have.text', 'Products');
  }

  add(product: string) {
    cy.get(this.addButton(product)).click();
    return this;
  }

  goToCart() {
    cy.get(this.cartLink).click();
    cy.location('pathname').should('eq', '/cart.html');
  }
}
