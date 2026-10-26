const { expect } = require('@playwright/test');
const { violations } = require('./index');

expect.extend({
  toMatchContract(received, schemaId) {
    const errs = violations(schemaId, received);
    return {
      pass: errs.length === 0,
      message: () =>
        errs.length === 0
          ? `esperava VIOLAR o contrato ${schemaId}, mas ele foi respeitado`
          : `contrato ${schemaId} violado:\n  - ${errs.join('\n  - ')}`,
    };
  },
});
