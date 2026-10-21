import { Page, Locator } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly title: Locator;
  readonly cartBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.locator('.title');
    this.cartBadge = page.locator('.shopping_cart_badge');
  }

  async getTitleText(): Promise<string> {
    return (await this.title.textContent()) || '';
  }

  async addProductToCart(productName: string) {
    const formattedName = productName.toLowerCase().replace(/\s+/g, '-');
    await this.page.click(`[data-test="add-to-cart-${formattedName}"]`);
  }

  async goToCart() {
    await this.page.click('.shopping_cart_link');
  }
}