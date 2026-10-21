# language: pt
Funcionalidade: Autenticação de Usuário
  Como um usuário da plataforma SauceDemo
  Quero realizar login no sistema
  Para acessar a lista de produtos

  Contexto:
    Dado que o usuário navega até a página inicial do SauceDemo

  Cenário: Login bem-sucedido (Fluxo Positivo)
    Quando insere o usuário "standard_user" e a senha "secret_sauce"
    E clica no botão de login
    Então deve ser redirecionado para a página de produtos com o título "Products"

  Esquema do Cenário: Tentativas de login inválidas (Fluxos Negativos)
    Quando insere o usuário "<usuario>" e a senha "<senha>"
    E clica no botão de login
    Então deve visualizar a mensagem de erro "<mensagem_erro>"

    Exemplos:
      | usuario         | senha        | mensagem_erro                                                              |
      | locked_out_user | secret_sauce | Epic sadface: Sorry, this user has been locked out.                        |
      | invalid_user    | secret_sauce | Epic sadface: Username and password do not match any user in this service |
      | standard_user   | wrong_pass   | Epic sadface: Username and password do not match any user in this service |
      |                 | secret_sauce | Epic sadface: Username is required                                         |
      | standard_user   |              | Epic sadface: Password is required                                         |