#!/usr/bin/env bash
# Executa um perfil de performance contra a API de mock local, com amostragem de recursos.
#
# Uso: ./scripts/run.sh [smoke|load] [opções extras do k6, ex.: -e VUS=200 -e HOLD=2m]
#
# Variáveis opcionais: BASE_URL (testa outra API; não sobe o mock), PORT (padrão 3000)
#
# Saídas em reports/<perfil>/:
#   k6-resumo.txt            resumo textual (métricas, p95/p99, vazão, thresholds)
#   perf-summary.json        resumo compacto (lido pelo relatório do pipeline)
#   k6-summary-completo.json todas as métricas do k6
#   load-report.html         relatório HTML autônomo
#   k6-dashboard.html        dashboard do k6 com gráficos no tempo
#   timeseries.csv           série temporal (VUs, req/s, latência, CPU, memória)
#   ANALISE-TEMPORAL.txt     tabela por janela + observações automáticas
#   timeseries.html          gráficos da série temporal
# Código de saída: 0 se todos os thresholds passaram; diferente de 0 caso contrário.
set -euo pipefail

PROFILE="${1:-load}"
shift || true
cd "$(dirname "$0")/.."
OUT="reports/${PROFILE}"
rm -rf "$OUT"
mkdir -p "$OUT"

command -v k6 >/dev/null || { echo "k6 não encontrado. Instale: https://grafana.com/docs/k6/latest/set-up/install-k6/" >&2; exit 127; }

PORT="${PORT:-3000}"
STARTED_SERVER=""
if [ -z "${BASE_URL:-}" ]; then
  PORT="$PORT" node ../api-tests/server/server.js >"$OUT/servidor.log" 2>&1 &
  SERVER_PID=$!
  STARTED_SERVER=1
  BASE_URL="http://localhost:${PORT}"
  for _ in $(seq 1 30); do
    curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fsS "${BASE_URL}/api/health" >/dev/null || { echo "API de mock não subiu" >&2; exit 1; }
  curl -fsS -X POST "${BASE_URL}/api/__reset" >/dev/null || true
fi
export BASE_URL
export K6_NO_USAGE_REPORT=true # não envia telemetria de uso do k6

BUCKET=30
[ "$PROFILE" = "smoke" ] && BUCKET=10

BASE_URL="$BASE_URL" node scripts/monitor.js "$OUT/timeseries.csv" 1 &
MON_PID=$!

cleanup() {
  kill "$MON_PID" 2>/dev/null || true
  wait "$MON_PID" 2>/dev/null || true
  if [ -n "$STARTED_SERVER" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT

set +e
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="$OUT/k6-dashboard.html" K6_WEB_DASHBOARD_PERIOD=5s \
  k6 run -e PROFILE="$PROFILE" -e BASE_URL="$BASE_URL" -e REPORT_DIR="$OUT" "$@" k6/load-test.js
STATUS=$?
set -e

# encerra o amostrador antes de analisar, para o CSV estar completo
kill "$MON_PID" 2>/dev/null || true
wait "$MON_PID" 2>/dev/null || true
node scripts/analyze.js "$OUT/timeseries.csv" --bucket "$BUCKET" >/dev/null || echo "aviso: análise temporal não gerada" >&2

echo "Relatórios em load-tests/${OUT}/ (thresholds: $([ $STATUS -eq 0 ] && echo APROVADO || echo REPROVADO))"
exit $STATUS
