import { Page, Locator } from '@playwright/test';

export class ProductsPage {
  readonly title: Locator;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;

  constructor(readonly page: Page) {
    this.title = page.locator('.title');
    this.cartBadge = page.locator('.shopping_cart_badge');
    this.cartLink = page.locator('.shopping_cart_link');
  }

  /** "Sauce Labs Backpack" -> botão data-test="add-to-cart-sauce-labs-backpack" */
  addToCartButton(productName: string): Locator {
    const slug = productName.toLowerCase().replace(/\s+/g, '-');
    return this.page.locator(`[data-test="add-to-cart-${slug}"]`);
  }

  async addProductToCart(productName: string) {
    await this.addToCartButton(productName).click();
  }

  async goToCart() {
    await this.cartLink.click();
  }
}
