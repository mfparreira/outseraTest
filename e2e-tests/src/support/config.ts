/**
 * Configuração central do E2E. Nada de URL, credencial ou timeout fixo fora deste arquivo.
 *
 * Tudo vem de variáveis de ambiente (ou de um arquivo .env local, ver .env.example), com padrões
 * pensados para o SauceDemo. No CI, defina-as no workflow (env:) ou em secrets/vars do repositório.
 */
import * as path from 'path';
import 'dotenv/config'; // carrega .env se existir; variáveis já definidas no ambiente têm prioridade

const root = path.resolve(__dirname, '..', '..');

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v !== undefined && v !== '' ? v : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Variável ${name} deve ser numérica (recebido "${v}")`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(v.toLowerCase());
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const v = str(name, fallback) as T;
  if (!allowed.includes(v)) throw new Error(`Variável ${name} deve ser uma de: ${allowed.join(', ')} (recebido "${v}")`);
  return v;
}

export type Policy = 'always' | 'on-failure' | 'off';
const POLICIES = ['always', 'on-failure', 'off'] as const;

export const config = {
  /** URL base da aplicação sob teste. As páginas navegam por caminho relativo ("/"). */
  baseUrl: str('E2E_BASE_URL', 'https://www.saucedemo.com').replace(/\/+$/, ''),

  /** Usuários e senha de teste (contas públicas de demonstração do SauceDemo). */
  users: {
    standard: str('E2E_STANDARD_USER', 'standard_user'),
    locked: str('E2E_LOCKED_USER', 'locked_out_user'),
    password: str('E2E_PASSWORD', 'secret_sauce'),
  },

  browser: {
    /** Sem janela. Padrão: headless no CI (CI=true) e com janela na máquina local. */
    headless: bool('E2E_HEADLESS', bool('CI', false)),
    /** Caminho de um Chromium/Chrome já instalado (opcional; vazio = usa o do Playwright). */
    executablePath: str('E2E_BROWSER_PATH', '') || undefined,
    /** Atraso entre ações em ms, útil para depurar localmente. */
    slowMo: num('E2E_SLOW_MO', 0),
    viewport: { width: num('E2E_VIEWPORT_WIDTH', 1280), height: num('E2E_VIEWPORT_HEIGHT', 720) },
  },

  timeouts: {
    /** Ação do Playwright (click, fill, goto). */
    action: num('E2E_ACTION_TIMEOUT_MS', 10_000),
    /** Tempo máximo de espera automática das assertions (expect). */
    expect: num('E2E_EXPECT_TIMEOUT_MS', 7_000),
    /** Tempo máximo de um step do Cucumber. */
    step: num('E2E_STEP_TIMEOUT_MS', 60_000),
  },

  /** Evidências. Trace do Playwright só em falha por padrão (pouco custo, máximo de diagnóstico). */
  evidence: {
    trace: oneOf<Policy>('E2E_TRACE', POLICIES, 'on-failure'),
    screenshot: oneOf<Policy>('E2E_SCREENSHOT', POLICIES, 'always'),
  },

  paths: {
    reports: path.join(root, 'reports'),
    screenshots: path.join(root, 'reports', 'screenshots'),
    traces: path.join(root, 'reports', 'traces'),
  },
};

/**
 * Variáveis que podem ser usadas nos arquivos .feature como ${NOME}.
 * Assim as credenciais não ficam no Gherkin nem aparecem nos relatórios.
 */
const placeholders: Record<string, string> = {
  STANDARD_USER: config.users.standard,
  LOCKED_USER: config.users.locked,
  PASSWORD: config.users.password,
};

/** Troca ${NOME} pelo valor configurado. Falha com mensagem clara se o nome não existir. */
export function resolve(text: string): string {
  return text.replace(/\$\{(\w+)\}/g, (_match, key: string) => {
    if (!(key in placeholders)) {
      throw new Error(`Variável \${${key}} não existe. Disponíveis: ${Object.keys(placeholders).map((k) => '${' + k + '}').join(', ')}`);
    }
    return placeholders[key];
  });
}
