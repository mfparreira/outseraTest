# Testes Automatizados de API (Playwright)

Suíte de testes de API com **Playwright** (`APIRequestContext`), cobrindo **GET, POST, PUT e DELETE**
com cenários **positivos e negativos**, e geração de relatório.

## Estrutura

```
server/server.js            API de exemplo (Node puro, sem dependências) usada como alvo
tests/helpers/api.js        Configuração central, login, payloads válidos
tests/auth.spec.js          Login e autenticação de rotas protegidas
tests/users.get.spec.js     GET (lista e por ID)
tests/users.post.spec.js    POST (criação)
tests/users.put.spec.js     PUT (atualização)
tests/users.delete.spec.js  DELETE (remoção)
tests/invalid-methods.spec.js  Métodos HTTP não permitidos (405 + header Allow)
scripts/generate-summary.js Gera reports/RELATORIO.md a partir do JSON do Playwright
```

## Como executar

Requer Node 18+.

```bash
npm install
npx playwright test        # sobe a API de exemplo automaticamente e roda tudo
npm run summary            # gera reports/RELATORIO.txt e .md
npm run report             # abre o relatório HTML interativo
```

Relatórios gerados em `reports/`: `html/` (interativo), `RELATORIO.md`, `results.json`, `junit.xml`.

## O que é validado

| Método | Positivos | Negativos |
|---|---|---|
| GET | 200, headers (Content-Type, Cache-Control, nosniff), estrutura do corpo, busca por ID | 404 (ID inexistente/rota), 400 (ID inválido/zero/negativo), 401 |
| POST | 201, header Location, corpo com ID, recurso recuperável via GET, campo opcional | 422 (campos ausentes, e-mail inválido, tipos errados, limites), 409 (duplicado), 400 (JSON malformado / não-objeto), 415, 401 |
| PUT | 200, corpo e persistência, idempotência, manter o próprio e-mail | 404, 400, 422, 409, JSON malformado, 401, recurso intacto após falha |
| DELETE | 204 sem corpo, GET seguinte retorna 404, total diminui, e-mail reutilizável | 404, DELETE repetido (404), 400, 401, recurso intacto sem auth |
| Métodos inválidos | — | 405 + header `Allow` correto em coleção e recurso; dados não alterados |
| Autenticação | Login válido, token funciona | Senha errada, usuário inexistente, campos ausentes, JSON malformado, sem token, token falso, esquema Basic |

## Apontar para outra API

URL, credenciais e caminhos ficam centralizados em `tests/helpers/api.js` e
`playwright.config.js`, configuráveis por variáveis de ambiente:

```bash
API_BASE_URL=https://minha-api.exemplo \
API_USER=usuario API_PASS=senha \
PATH_LOGIN=/auth/login PATH_USERS=/users \
npx playwright test
```

Atenção: as **asserções** (status codes, mensagens, nomes de campos) refletem o contrato
da API de exemplo. Ao trocar de API, ajuste-as ao contrato real. O `resetData` usa um endpoint
que só existe na API de exemplo; em uma API externa, remova a chamada ou adapte o setup.

## Boas práticas aplicadas

- Testes independentes: e-mails únicos por teste, dados criados dentro do próprio teste.
- Cada teste valida status, headers e corpo (não apenas o status).
- Negativos verificam também que **nada foi alterado** (efeito colateral zero).
- Payload malformado enviado como `Buffer`: o Playwright serializa `string` com
  `Content-Type: application/json` como JSON válido, o que mascararia o teste.
- Configuração centralizada, sem URLs ou credenciais espalhadas pelos testes.

---

## Suíte para o JSONPlaceholder (https://jsonplaceholder.typicode.com)

Pasta `tests-jsonplaceholder/`, config em `playwright.jsonplaceholder.config.js`.

```bash
npm run test:jsonplaceholder      # roda contra o site real
npm run summary:jsonplaceholder   # gera reports-jsonplaceholder/RELATORIO.txt e .md
npm run report:jsonplaceholder    # relatório HTML interativo
```

Como o JSONPlaceholder é uma API pública de demonstração, **não tem autenticação nem validação
e não persiste dados** (as respostas de POST/PUT/PATCH/DELETE são simuladas). Por isso os cenários
negativos foram ajustados ao comportamento real:

| Cenário | O que o teste faz |
|---|---|
| Recurso/ID inexistente, ID inválido | Espera 404 |
| Método inválido (PUT/DELETE/PATCH em coleção, POST em `/posts/1`) | Espera 404 ou 405 |
| Payload vazio, campos ausentes, tipos errados | Documenta que a API **aceita** (201/200): sem validação |
| JSON malformado | Registra o status observado (anotação no relatório) e confirma que nada foi criado |
| Autenticação inválida | Documenta que a API é pública: token falso é ignorado (200) |
| Persistência | Confirma que POST/PUT/DELETE **não** alteram os dados (GET seguinte inalterado) |

Status exatos fixados a partir da execução real de 21/10/2026: JSON malformado em POST/PUT e PUT em ID
inexistente retornam **500**; DELETE em ID inexistente retorna **200**; OPTIONS retorna **204**.
Os testes de método inválido ainda aceitam 404 ou 405 (o status exato é registrado como anotação
"status observado" no relatório; depois de rodar, fixe o valor visto).

`headers.spec.js` valida, para GET/POST/PUT/PATCH/DELETE, status e `Content-Type: application/json; charset=utf-8`,
e para o GET também `x-content-type-options`, `access-control-allow-credentials`, `vary`, `cache-control`, `etag`
e `x-ratelimit-*` (valores conferidos com `curl -i`). O servidor **só envia `Access-Control-Allow-Origin`
quando a requisição traz o header `Origin`**; sem ele, o header não existe (há um teste para isso).
Demais headers são anotados no relatório.

### Relatório consolidado das duas suítes

```bash
npm test
npm run test:jsonplaceholder
npm run consolidated      # gera reports/RELATORIO-CONSOLIDADO.txt
```

## Validação de contrato (JSON Schema / Ajv)

Além dos asserts funcionais, endpoints representativos têm o **formato** da resposta validado contra JSON Schema
(`contracts/schemas/*.json`, validados com Ajv em modo estrito + `ajv-formats`): tipos, campos obrigatórios, formatos
(e-mail), `additionalProperties: false` (pega vazamento de campos, como senha) e o formato único das respostas de erro.

- `tests/contract.spec.js` (API local): login, lista, busca por id, POST (+ header `Location`), PUT e as respostas de erro 401/404/405/422,
  mais um **controle negativo** que prova que o validador de fato detecta campo ausente, tipo errado, formato inválido e campo extra.
- `tests-jsonplaceholder/contract.spec.js`: `/posts` (todos os itens), `/posts/1`, `/posts/1/comments`, POST e PUT.
- Uso nos testes: `expect(body).toMatchContract('user.schema.json')` (matcher em `contracts/matchers.js`; erros listam o caminho exato da violação).

Para um novo endpoint: criar o schema em `contracts/schemas/` e usar o matcher; nada mais precisa ser registrado.
