// Validação de contrato com JSON Schema (Ajv).
// Os schemas ficam em contracts/schemas/*.json e são a "fonte da verdade" do formato das respostas.
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const dir = path.join(__dirname, 'schemas');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/** Devolve a lista de violações do contrato em texto legível (vazia = válido). */
function violations(schemaId, data) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`Schema desconhecido: ${schemaId}`);
  if (validate(data)) return [];
  return validate.errors.map((e) => `${e.instancePath || '(raiz)'} ${e.message}${e.params && e.params.additionalProperty ? ` ("${e.params.additionalProperty}")` : ''}`);
}

/**
 * Para uso nos testes: expect(data).toMatchContract('user.schema.json').
 * Registrado via expect.extend em contracts/matchers.js.
 */
module.exports = { violations, ajv };
