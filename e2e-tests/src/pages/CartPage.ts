import { Page, Locator } from '@playwright/test';

export class CartPage {
  readonly checkoutButton: Locator;

  constructor(readonly page: Page) {
    this.checkoutButton = page.locator('[data-test="checkout"]');
  }

  async clickCheckout() {
    await this.checkoutButton.click();
  }
}
