# Testes de performance (k6)

Perfis **smoke** e **load** com a mesma jornada de usuário, parametrizáveis, com thresholds de erro e latência,
métricas p95/p99/vazão e evidências geradas a cada execução. Resultado e interpretação: [`ANALISE-DE-PERFORMANCE.md`](ANALISE-DE-PERFORMANCE.md).

## Perfis

| | smoke | load |
|---|---|---|
| Objetivo | validar script, API e thresholds a baixo custo (roda em todo commit no CI) | 500 usuários simultâneos sustentados por 5 min |
| Usuários (`VUS`) | 2 | 500 |
| Rampa de subida (`RAMP_UP`) | 10s | 30s |
| Patamar (`HOLD`) | 40s | 5m |
| Rampa de descida (`RAMP_DOWN`) | 10s | 30s |
| p95 máx. (`P95_MS`) / p99 máx. (`P99_MS`) | 300 / 600 ms | 500 / 1000 ms |
| Taxa de erro máx. (`MAX_ERROR_RATE`) | 0,5 % | 1 % |
| Vazão mínima (`MIN_RPS`) | 1 req/s | 400 req/s |

Qualquer valor pode ser trocado na hora com `-e`, sem editar o script:

```bash
./scripts/run.sh smoke
./scripts/run.sh load                                    # perfil oficial (500 VUs, 5 min)
./scripts/run.sh load -e VUS=200 -e HOLD=2m              # parametrizado
BASE_URL=https://homolog.exemplo.com ./scripts/run.sh load -e API_USER=... -e API_PASS=...   # outro ambiente (não sobe o mock)
```

Demais parâmetros: `THINK_MIN`/`THINK_MAX` (pausa entre iterações, s), `WRITE_RATIO` (fração de iterações com escrita),
`NEGATIVE_RATIO` (fração com chamadas negativas esperadas), `REPORT_DIR`.

## Jornada simulada

Login uma vez por usuário → listar + buscar por id → (30 %) criar → atualizar → remover → (10 %) chamadas negativas esperadas
(404 e 401, que não contam como falha) → pausa. Cada resposta passa por `check` (status e formato).

## Critérios de aprovação (thresholds)

O k6 termina com código ≠ 0 (e o job do CI falha) se qualquer um for violado: p95 e p99 globais, p95 por endpoint,
taxa de falha HTTP, taxa de erros de negócio, checks > 99 %, nenhum login com falha e vazão mínima. Há também um
**aborto de segurança** se mais de 30 % das requisições falharem (evita martelar uma API já fora do ar).

## Evidências

`./scripts/run.sh <perfil>` grava em `reports/<perfil>/` (no CI: artefato `perf-<perfil>-reports`):

| Arquivo | Conteúdo |
|---|---|
| `k6-resumo.txt` | resumo textual: vazão, p95/p99 total e por endpoint, checks e thresholds |
| `perf-summary.json` | resumo compacto (lido pelo relatório consolidado do pipeline) |
| `load-report.html` | relatório HTML autônomo |
| `k6-dashboard.html` | dashboard oficial do k6, com gráficos no tempo |
| `timeseries.csv` / `timeseries.html` / `ANALISE-TEMPORAL.txt` | VUs, req/s, latência, CPU e memória do servidor e do k6 a cada segundo, com observações automáticas |
| `k6-summary-completo.json` | todas as métricas do k6 |

`evidencias/` guarda a execução de referência (smoke, load de 500 VUs e a sondagem sem pausa).

## CI/CD

- **smoke:** job `perf-smoke`, em todo push/PR.
- **load:** job `perf-load`, **semanal (segunda 06:00 UTC)** ou manual (*Run workflow* → `run_load`, com `load_vus`, `load_ramp_up` e `load_hold`).
  Não roda em todo commit porque dura ~7 min e satura o runner.

Requer k6 ≥ 1.0 e Node 18+ (o mock da API é o `api-tests/server`).
