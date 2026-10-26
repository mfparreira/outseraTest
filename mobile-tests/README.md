# Testes mobile

**Status: não executados neste projeto (fora do escopo).**

O workflow `.github/workflows/ci.yml` declara o job `mobile` com uma condição que só o torna ativo em disparo manual (`run_mobile=true`), então ele aparece
como *skipped* em cada execução. Ele existe para mostrar onde os testes mobile se integrariam.

## Como seria a integração (não implementada)

1. Suíte com **Appium + WebdriverIO** (ou Maestro) nesta pasta, gerando `reports/` em JSON/JUnit.
2. No job `mobile`, em `ubuntu-latest` com virtualização KVM habilitada:
   - subir um emulador Android com `reactivecircus/android-emulator-runner`;
   - instalar o app (APK) e iniciar o servidor Appium;
   - executar a suíte e publicar `reports/` como artefato `mobile-reports`.
3. Trocar a condição do job (`github.event_name == 'workflow_dispatch' && inputs.run_mobile`) por uma condição real (por exemplo, apenas em `push` na `main`, já que
   emulador é lento) e incluir a leitura de `mobile-reports` em `ci/build-report.js`.
