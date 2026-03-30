import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const KnownKeyProviders = [
  'openai',
  'codex',
  'google',
  'deepseek',
  'anthropic',
  'claude-code',
  'zai',
  'kimi',
  'minimax',
  'cerebras',
  'openrouter',
] as const;

export type KeyProvider = (typeof KnownKeyProviders)[number];

interface ApiKeyCredentials {
  apiKey: string;
}

export interface ProviderCredentialsMap {
  openai: ApiKeyCredentials;
  codex: {
    apiKey: string;
    'chatgpt-account-id': string;
  };
  google: ApiKeyCredentials;
  deepseek: ApiKeyCredentials;
  anthropic: ApiKeyCredentials;
  'claude-code': {
    oauthToken: string;
    betaFlag: string;
    billingHeader: string;
  };
  zai: ApiKeyCredentials;
  kimi: ApiKeyCredentials;
  minimax: ApiKeyCredentials;
  cerebras: ApiKeyCredentials;
  openrouter: ApiKeyCredentials;
}

export type ProviderCredentials<TProvider extends KeyProvider> = ProviderCredentialsMap[TProvider];

type ProviderCredentialOption<TProvider extends KeyProvider> = Extract<
  keyof ProviderCredentialsMap[TProvider],
  string
>;

export interface CredentialFieldSpec<TOption extends string = string> {
  option: TOption;
  env: string;
  aliases: readonly string[];
}

export interface ProviderCredentialSpec<TProvider extends KeyProvider = KeyProvider> {
  provider: TProvider;
  fields: readonly CredentialFieldSpec<ProviderCredentialOption<TProvider>>[];
}

export interface MissingCredentialField<TProvider extends KeyProvider = KeyProvider> {
  option: ProviderCredentialOption<TProvider>;
  env: string;
  aliases: readonly string[];
}

export interface MissingProviderCredentialsError<TProvider extends KeyProvider = KeyProvider> {
  code: 'missing_provider_credentials';
  message: string;
  provider: TProvider;
  path?: string;
  missing: MissingCredentialField<TProvider>[];
}

export interface KeysFileNotFoundError<TProvider extends KeyProvider = KeyProvider> {
  code: 'keys_file_not_found';
  message: string;
  provider: TProvider;
  path: string;
}

export type ResolveProviderCredentialsError<TProvider extends KeyProvider = KeyProvider> =
  | MissingProviderCredentialsError<TProvider>
  | KeysFileNotFoundError<TProvider>;

export type ResolveProviderCredentialsResult<TProvider extends KeyProvider> =
  | {
      ok: true;
      provider: TProvider;
      credentials: ProviderCredentials<TProvider>;
    }
  | {
      ok: false;
      provider: TProvider;
      error: ResolveProviderCredentialsError<TProvider>;
    };

export type KeysFileValues = Record<string, string>;

const providerCredentialSpecs: {
  [TProvider in KeyProvider]: readonly CredentialFieldSpec<ProviderCredentialOption<TProvider>>[];
} = {
  openai: [{ option: 'apiKey', env: 'OPENAI_API_KEY', aliases: [] }],
  codex: [
    { option: 'apiKey', env: 'CODEX_API_KEY', aliases: [] },
    {
      option: 'chatgpt-account-id',
      env: 'CODEX_CHATGPT_ACCOUNT_ID',
      aliases: ['CHATGPT_ACCOUNT_ID'],
    },
  ],
  google: [{ option: 'apiKey', env: 'GOOGLE_API_KEY', aliases: [] }],
  deepseek: [{ option: 'apiKey', env: 'DEEPSEEK_API_KEY', aliases: [] }],
  anthropic: [
    {
      option: 'apiKey',
      env: 'ANTHROPIC_API_KEY',
      aliases: ['ANTHROPIC_API_KEYS'],
    },
  ],
  'claude-code': [
    {
      option: 'oauthToken',
      env: 'CLAUDE_CODE_OAUTH_TOKEN',
      aliases: [],
    },
    {
      option: 'betaFlag',
      env: 'CLAUDE_CODE_BETA_FLAG',
      aliases: [],
    },
    {
      option: 'billingHeader',
      env: 'CLAUDE_CODE_BILLING_HEADER',
      aliases: [],
    },
  ],
  zai: [{ option: 'apiKey', env: 'ZAI_API_KEY', aliases: [] }],
  kimi: [{ option: 'apiKey', env: 'KIMI_API_KEY', aliases: [] }],
  minimax: [{ option: 'apiKey', env: 'MINIMAX_API_KEY', aliases: [] }],
  cerebras: [{ option: 'apiKey', env: 'CEREBRAS_API_KEY', aliases: [] }],
  openrouter: [{ option: 'apiKey', env: 'OPENROUTER_API_KEY', aliases: [] }],
};

const SAFE_UNQUOTED_VALUE_PATTERN = /^[A-Za-z0-9_./:@=-]+$/;

export function getProviderCredentialSpec<TProvider extends KeyProvider>(
  provider: TProvider
): ProviderCredentialSpec<TProvider> {
  return {
    provider,
    fields: providerCredentialSpecs[provider],
  };
}

export function parseKeysFile(content: string): KeysFileValues {
  const values: KeysFileValues = {};
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/u);

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const line = trimmedLine.startsWith('export ')
      ? trimmedLine.slice('export '.length).trimStart()
      : trimmedLine;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    values[key] = parseSerializedValue(rawValue);
  }

  return values;
}

export function stringifyKeysFile(values: KeysFileValues): string {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${serializeValue(value)}`);
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

export async function readKeysFile(filePath: string): Promise<KeysFileValues> {
  const content = await readFile(filePath, 'utf8');
  return parseKeysFile(content);
}

export async function writeKeysFile(filePath: string, values: KeysFileValues): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyKeysFile(values), 'utf8');
}

export function resolveProviderCredentialsFromValues<TProvider extends KeyProvider>(
  provider: TProvider,
  values: KeysFileValues
): ResolveProviderCredentialsResult<TProvider> {
  const spec = providerCredentialSpecs[provider];
  const credentials: Partial<Record<ProviderCredentialOption<TProvider>, string>> = {};
  const missing: MissingCredentialField<TProvider>[] = [];

  for (const field of spec) {
    const resolvedValue = resolveFieldValue(values, field);
    if (!resolvedValue) {
      missing.push(field);
      continue;
    }

    credentials[field.option] = resolvedValue;
  }

  if (missing.length > 0) {
    return {
      ok: false,
      provider,
      error: {
        code: 'missing_provider_credentials',
        message: formatMissingCredentialsMessage(provider, missing),
        provider,
        missing,
      },
    };
  }

  return {
    ok: true,
    provider,
    credentials: credentials as ProviderCredentials<TProvider>,
  };
}

export async function resolveProviderCredentials<TProvider extends KeyProvider>(
  filePath: string,
  provider: TProvider
): Promise<ResolveProviderCredentialsResult<TProvider>> {
  try {
    const values = await readKeysFile(filePath);
    const result = resolveProviderCredentialsFromValues(provider, values);

    if (!result.ok && result.error.code === 'missing_provider_credentials') {
      return {
        ...result,
        error: {
          ...result.error,
          path: filePath,
        },
      };
    }

    return result;
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return {
        ok: false,
        provider,
        error: {
          code: 'keys_file_not_found',
          message: `Keys file not found at ${filePath}`,
          provider,
          path: filePath,
        },
      };
    }

    throw error;
  }
}

export async function upsertKeysFileValues(
  filePath: string,
  values: KeysFileValues
): Promise<KeysFileValues> {
  const existingValues = await readExistingKeysFile(filePath);
  const nextValues: KeysFileValues = { ...existingValues };

  for (const [key, value] of Object.entries(values)) {
    nextValues[key] = value;
  }

  await writeKeysFile(filePath, nextValues);
  return nextValues;
}

export async function setProviderCredentials<TProvider extends KeyProvider>(
  filePath: string,
  provider: TProvider,
  credentials: Partial<ProviderCredentials<TProvider>>
): Promise<KeysFileValues> {
  const updates: KeysFileValues = {};

  for (const field of providerCredentialSpecs[provider]) {
    const value = credentials[field.option];
    if (typeof value === 'string') {
      updates[field.env] = value;
    }
  }

  return upsertKeysFileValues(filePath, updates);
}

async function readExistingKeysFile(filePath: string): Promise<KeysFileValues> {
  try {
    return await readKeysFile(filePath);
  } catch (error) {
    if (isNodeErrorWithCode(error, 'ENOENT')) {
      return {};
    }

    throw error;
  }
}

function resolveFieldValue<TOption extends string>(
  values: KeysFileValues,
  field: CredentialFieldSpec<TOption>
): string | undefined {
  const keys = [field.env, ...field.aliases];

  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function parseSerializedValue(rawValue: string): string {
  if (rawValue.length === 0) {
    return '';
  }

  const startsWithDoubleQuote = rawValue.startsWith('"');
  const endsWithDoubleQuote = rawValue.endsWith('"');
  if (startsWithDoubleQuote && endsWithDoubleQuote && rawValue.length >= 2) {
    try {
      return JSON.parse(rawValue) as string;
    } catch {
      return rawValue.slice(1, -1);
    }
  }

  const startsWithSingleQuote = rawValue.startsWith("'");
  const endsWithSingleQuote = rawValue.endsWith("'");
  if (startsWithSingleQuote && endsWithSingleQuote && rawValue.length >= 2) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

function serializeValue(value: string): string {
  if (value.length > 0 && SAFE_UNQUOTED_VALUE_PATTERN.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function formatMissingCredentialsMessage<TProvider extends KeyProvider>(
  provider: TProvider,
  missing: readonly MissingCredentialField<TProvider>[]
): string {
  const details = missing
    .map((field) => {
      const envNames = [field.env, ...field.aliases];
      return `${field.option} (${envNames.join(' or ')})`;
    })
    .join(', ');

  return `Missing credentials for provider "${provider}": ${details}`;
}

function isNodeErrorWithCode(
  error: unknown,
  code: string
): error is NodeJS.ErrnoException & { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
