# language: pt
Funcionalidade: Fluxo de Checkout no E-commerce
  Como um cliente logado na plataforma
  Quero adicionar produtos ao carrinho e realizar o checkout
  Para concluir a minha compra

  Contexto:
    Dado que o usuário está autenticado no sistema com "standard_user" e "secret_sauce"
    E adiciona o produto "Sauce Labs Backpack" ao carrinho
    E navega até o carrinho de compras e clica em checkout

  Cenário: Finalização de compra com sucesso (Fluxo Positivo)
    Quando preenche os dados de entrega com Nome "João", Sobrenome "Silva" e CEP "12345-678"
    E avança no fluxo e confirma o pedido
    Então deve visualizar a mensagem de sucesso "Thank you for your order!"

  Esquema do Cenário: Validação de campos obrigatórios no formulário de entrega (Fluxos Negativos)
    Quando preenche os dados de entrega com Nome "<nome>", Sobrenome "<sobrenome>" e CEP "<cep>"
    E clica no botão continuar
    Então deve visualizar a mensagem de erro de checkout "<mensagem_erro>"

    Exemplos:
      | nome | sobrenome | cep       | mensagem_erro                  |
      |      | Silva     | 12345-678 | Error: First Name is required  |
      | João |           | 12345-678 | Error: Last Name is required   |
      | João | Silva     |           | Error: Postal Code is required |