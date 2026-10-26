# Análise dos resultados de performance

Execução de referência (evidências em `evidencias/`): k6 v1.3.0, API de exemplo local (`api-tests/server`, Node, dados em memória),
gerador de carga e servidor **na mesma máquina** (2 vCPUs, 8 GB). Uma execução de cada perfil.

## 1. Resultados

| | Smoke | **Carga (500 VUs, 5 min)** | Sondagem de capacidade (sem pausa)* |
|---|---|---|---|
| Perfil | 2 VUs · 10s/40s/10s | **500 VUs · 30s sobe / 5m sustenta / 30s desce** | 500 VUs · 20s/1m/10s, pausa 0 s |
| Duração real | 60 s | 362 s | 90 s |
| Requisições | 193 | **257.316** | 545.619 |
| Vazão média (req/s) | 3,2 | **710** (≈ 775 no patamar) | 6.058 |
| Latência média / mediana | 0,43 / 0,36 ms | **0,38 / 0,24 ms** | 61,8 / 56,6 ms |
| **p95** | 0,74 ms | **0,66 ms** | 157 ms |
| **p99** | 1,01 ms | **3,35 ms** | 204 ms |
| Máxima | 2,4 ms | 40,8 ms | 358 ms |
| Falhas HTTP / de negócio | 0 % / 0 % | **0 % / 0 %** | 0 % / 0 % |
| Checks | 100 % | 100 % (473.028) | 100 % (1.003.161) |
| Thresholds | ✅ | ✅ (14/14) | ✅ |

\* Não é o perfil oficial: foi rodada só para descobrir até onde o ambiente aguenta (ver seção 3).

Jornada simulada por usuário (login uma vez; depois repetição): leitura (listar + buscar por id), em 30 % das iterações escrita
(criar → atualizar → remover) e em 10 % chamadas negativas esperadas (404 e 401, que não contam como erro).
Pausa de 1–3 s entre iterações.

Por endpoint na carga oficial (p95 / p99, ms): login 1,16 / 2,22 · list 0,77 / 5,72 · get 0,62 / 3,59 ·
create 0,62 / 2,43 · update 0,56 / 1,89 · delete 0,45 / 1,31.

## 2. Comportamento observado (carga oficial)

- **Estável durante todo o patamar.** Vazão constante em 770–783 req/s do segundo 30 ao 330, sem nenhuma janela de 30 s com falha.
- **A vazão é ditada pela pausa, não pelo servidor.** Modelo fechado: 500 usuários ÷ (≈ 2 s de pausa + latência desprezível) ≈ 250 iterações/s ≈ 775 req/s. O servidor
  apenas acompanhou: usou cerca de **9–10 % de um núcleo**. Ou seja, o teste comprova que 500 usuários simultâneos com esse comportamento
  são atendidos com folga, mas **não encontra o limite do sistema**.
- **Leve crescimento de latência dentro do patamar** (média da janela 0,3 ms → 0,6 ms; máx. 0,5 → 3,2 ms). Em termos absolutos é irrelevante, mas coincide com a CPU do
  k6 subindo de 31 % para 48 % de um núcleo, enquanto a CPU do servidor ficou plana em 9 %. Hipótese mais provável: custo crescente do **próprio gerador** (acúmulo de métricas
  e do dashboard) e não degradação do servidor. Não foi comprovada isolando o gerador.
- **Memória do servidor**: 65 MB → 88 MB, em dente de serra (caiu para 67,6 MB aos 180 s, quando o GC atuou). Sem tendência de crescimento contínuo em 5 min; isso **não** descarta vazamento lento.
- **p99 maior que p95 por uma ordem de grandeza** (0,66 → 3,35 ms), com o `list` pior (5,72 ms): caudas curtas típicas de pausas de GC e disputa de CPU, sem relevância prática aqui.

## 3. Sondagem de capacidade (sem pausa entre iterações)

Mesma jornada, sem *think time*: o gerador passa a impor a carga máxima que consegue.

- Vazão **6.058 req/s** (≈ 8–9× a da carga oficial), 0 erros, p95 157 ms, p99 204 ms, máx. 358 ms.
- A **CPU total da máquina foi a 100 %**: k6 consumiu ~165 % de um núcleo e o servidor só ~33 %. **O limite observado é do gerador de carga**, não da API. A latência de ~60 ms
  aqui é, em boa parte, fila de CPU compartilhada, e não tempo de processamento do servidor (que era 0,3 ms sem saturação).
- Extrapolação (hipótese, não medida): se o servidor usa ~33 % de um núcleo para 6 mil req/s, o teto de um único processo Node estaria na casa de **15–18 mil req/s**. Para confirmar,
  seria preciso gerar carga de outra máquina.
- Além disso, o `GET /users` devolve a coleção **inteira, sem paginação**: nesta sondagem foram 1,35 GB trafegados para 545 mil requisições (≈ 2,5 KB cada). Com mais dados, serialização e rede viram o primeiro gargalo.

## 4. Possíveis gargalos (para um sistema real)

1. **Processo único (event loop do Node)**: um único núcleo atende tudo; escalar exige `cluster`/réplicas.
2. **Listagem sem paginação**: custo e payload crescem linearmente com a quantidade de registros.
3. **Buscas lineares em memória** (`findIndex`, verificação de e-mail duplicado): O(n) por requisição; viram problema com muitos registros (um banco com índices resolveria).
4. **Gerador de carga na mesma máquina**: mascara o limite real do servidor (ver seção 3).
5. Não exercitados aqui, por não existirem no mock: banco de dados, pool de conexões, TLS, rede, balanceador, cache.

## 5. Limitações do ambiente e do método

- **Cliente e servidor no mesmo host de 2 vCPUs**, via *loopback*: sem latência de rede, sem TLS, sem balanceador. Os milissegundos medidos **não representam** produção.
- O alvo é um **mock em memória**, sem banco, sem integrações e sem dados em volume.
- **Uma execução por perfil**: não há medida de variância entre rodadas. Em runner compartilhado (GitHub Actions) os números oscilam.
- **Carga de modelo fechado** (usuários com pausa). Não mede taxa de chegada fixa (modelo aberto) nem picos abruptos (*spike*), nem resistência de longa duração (*soak* de horas).
- **Observabilidade limitada**: o servidor foi observado por `/proc` e por uma sonda `GET /api/health`; com o gerador saturado, a API de métricas do k6 deixou de responder
  em parte dos segundos (49 de 92 amostras vazias na sondagem), por isso a série temporal dessa rodada é menos densa. As vazões por janela foram calculadas pelo contador acumulado para não distorcer.
- **Thresholds calibrados de forma conservadora** (p95 < 500 ms, p99 < 1000 ms): o resultado observado é centenas de vezes melhor, então hoje eles só pegariam regressões grosseiras.

## 6. Conclusão técnica

Para o escopo pedido, **o teste está aprovado**: 500 usuários simultâneos por 5 minutos, 257 mil requisições, **0 % de erros**, **p95 = 0,66 ms**, **p99 = 3,35 ms**, 710 req/s,
todos os 14 thresholds atendidos. A API de exemplo atende essa carga com folga (≈ 10 % de um núcleo).

Mas é preciso ser honesto sobre o alcance: o resultado prova que **a solução de teste funciona, que a API de exemplo não tem defeito de concorrência ou de corretude sob 500 usuários**
(os checks de negócio ficaram em 100 %) e fornece uma linha de base; ele **não** prova que um sistema real aguentaria 500 usuários. Para isso é preciso apontar o mesmo script para um ambiente
de homologação (`BASE_URL=...`), com gerador em máquina separada, e **então** apertar os thresholds com base no histórico.

Próximos passos recomendados: (1) executar contra homologação; (2) rodar o gerador fora do host do servidor; (3) acrescentar perfis *stress* (rampa até o ponto de quebra) e *soak* (horas);
(4) paginar `GET /users` no mock para refletir APIs reais; (5) guardar o `perf-summary.json` de cada execução agendada e criar um gráfico de tendência.
