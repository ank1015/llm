import { getModel } from '@ank1015/llm-core';

import { getSdkConfig } from './config.js';
import { resolveProviderCredentials } from './keys.js';

import type { ResolveProviderCredentialsError } from './keys.js';
import type {
  AnthropicProviderOptions,
  ClaudeCodeProviderOptions,
  CodexProviderOptions,
  GoogleProviderOptions,
  Model,
  OpenAIProviderOptions,
  Provider,
} from '@ank1015/llm-core';

export const ReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffort = (typeof ReasoningEfforts)[number];

const CLAUDE_CODE_API = 'claude-code' as const;

const OPENAI_MODEL_CATALOG = {
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.4-pro': 'gpt-5.4-pro',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.4-nano': 'gpt-5.4-nano',
} as const;

const CODEX_MODEL_CATALOG = {
  'codex/gpt-5.4': 'gpt-5.4',
  'codex/gpt-5.4-mini': 'gpt-5.4-mini',
  'codex/gpt-5.3-codex': 'gpt-5.3-codex',
  'codex/gpt-5.3-codex-spark': 'gpt-5.3-codex-spark',
} as const;

const ANTHROPIC_MODEL_CATALOG = {
  'anthropic/claude-opus-4-6': 'claude-opus-4-6',
  'anthropic/claude-sonnet-4-6': 'claude-sonnet-4-6',
} as const;

const CLAUDE_CODE_MODEL_CATALOG = {
  'claude-code/claude-opus-4-6': 'claude-opus-4-6',
  'claude-code/claude-sonnet-4-6': 'claude-sonnet-4-6',
} as const;

const GOOGLE_MODEL_CATALOG = {
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': 'gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
} as const;

export type OpenAIModelId = keyof typeof OPENAI_MODEL_CATALOG;
export type CodexModelId = keyof typeof CODEX_MODEL_CATALOG;
export type AnthropicModelId = keyof typeof ANTHROPIC_MODEL_CATALOG;
export type ClaudeCodeModelId = keyof typeof CLAUDE_CODE_MODEL_CATALOG;
export type GoogleModelId = keyof typeof GOOGLE_MODEL_CATALOG;
export type CuratedModelId =
  | OpenAIModelId
  | CodexModelId
  | AnthropicModelId
  | ClaudeCodeModelId
  | GoogleModelId;

export const CuratedModelIds = [
  ...Object.keys(OPENAI_MODEL_CATALOG),
  ...Object.keys(CODEX_MODEL_CATALOG),
  ...Object.keys(ANTHROPIC_MODEL_CATALOG),
  ...Object.keys(CLAUDE_CODE_MODEL_CATALOG),
  ...Object.keys(GOOGLE_MODEL_CATALOG),
] as CuratedModelId[];

export interface SupportedProviderOptionsByApi {
  openai: OpenAIProviderOptions;
  codex: CodexProviderOptions;
  anthropic: AnthropicProviderOptions;
  [CLAUDE_CODE_API]: ClaudeCodeProviderOptions;
  google: GoogleProviderOptions;
}

export type ProviderOptionsForApi<TApi extends keyof SupportedProviderOptionsByApi> =
  SupportedProviderOptionsByApi[TApi];

export type SupportedProviderOptions =
  SupportedProviderOptionsByApi[keyof SupportedProviderOptionsByApi];

export type ProviderOptionsForModelId<TModelId extends string> = TModelId extends OpenAIModelId
  ? OpenAIProviderOptions
  : TModelId extends CodexModelId
    ? CodexProviderOptions
    : TModelId extends AnthropicModelId
      ? AnthropicProviderOptions
      : TModelId extends ClaudeCodeModelId
        ? ClaudeCodeProviderOptions
        : TModelId extends GoogleModelId
          ? GoogleProviderOptions
          : SupportedProviderOptions;

export interface ResolveModelInputInput<TModelId extends string = string> {
  modelId: TModelId;
  reasoningEffort?: ReasoningEffort;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string;
}

export interface UnsupportedModelIdError {
  code: 'unsupported_model_id';
  message: string;
  modelId: string;
  supportedModelIds: CuratedModelId[];
}

export interface CoreModelNotFoundError {
  code: 'core_model_not_found';
  message: string;
  modelId: CuratedModelId;
  api: 'openai' | 'codex' | 'anthropic' | typeof CLAUDE_CODE_API | 'google';
  providerModelId: string;
}

type OpenAICredentialsError = ResolveProviderCredentialsError<'openai'>;
type CodexCredentialsError = ResolveProviderCredentialsError<'codex'>;
type AnthropicCredentialsError = ResolveProviderCredentialsError<'anthropic'>;
type ClaudeCodeCredentialsError = ResolveProviderCredentialsError<typeof CLAUDE_CODE_API>;
type GoogleCredentialsError = ResolveProviderCredentialsError<'google'>;

export type ResolveModelInputError =
  | UnsupportedModelIdError
  | CoreModelNotFoundError
  | OpenAICredentialsError
  | CodexCredentialsError
  | AnthropicCredentialsError
  | ClaudeCodeCredentialsError
  | GoogleCredentialsError;

export interface ResolvedOpenAIModelInput {
  ok: true;
  api: 'openai';
  modelId: OpenAIModelId;
  keysFilePath: string;
  model: Model<'openai'>;
  providerOptions: OpenAIProviderOptions;
  provider: Provider<'openai'>;
}

export interface ResolvedCodexModelInput {
  ok: true;
  api: 'codex';
  modelId: CodexModelId;
  keysFilePath: string;
  model: Model<'codex'>;
  providerOptions: CodexProviderOptions;
  provider: Provider<'codex'>;
}

export interface ResolvedAnthropicModelInput {
  ok: true;
  api: 'anthropic';
  modelId: AnthropicModelId;
  keysFilePath: string;
  model: Model<'anthropic'>;
  providerOptions: AnthropicProviderOptions;
  provider: Provider<'anthropic'>;
}

export interface ResolvedClaudeCodeModelInput {
  ok: true;
  api: typeof CLAUDE_CODE_API;
  modelId: ClaudeCodeModelId;
  keysFilePath: string;
  model: Model<typeof CLAUDE_CODE_API>;
  providerOptions: ClaudeCodeProviderOptions;
  provider: Provider<typeof CLAUDE_CODE_API>;
}

export interface ResolvedGoogleModelInput {
  ok: true;
  api: 'google';
  modelId: GoogleModelId;
  keysFilePath: string;
  model: Model<'google'>;
  providerOptions: GoogleProviderOptions;
  provider: Provider<'google'>;
}

export interface ResolveModelInputFailure {
  ok: false;
  modelId: string;
  keysFilePath: string;
  error: ResolveModelInputError;
}

export type ResolveModelInputResult =
  | ResolvedOpenAIModelInput
  | ResolvedCodexModelInput
  | ResolvedAnthropicModelInput
  | ResolvedClaudeCodeModelInput
  | ResolvedGoogleModelInput
  | ResolveModelInputFailure;

export function isCuratedModelId(value: string): value is CuratedModelId {
  return CuratedModelIds.includes(value as CuratedModelId);
}

export async function resolveModelInput<TModelId extends string>(
  input: ResolveModelInputInput<TModelId>
): Promise<ResolveModelInputResult> {
  const keysFilePath = input.keysFilePath ?? getSdkConfig().keysFilePath;

  if (isOpenAIModelId(input.modelId)) {
    return resolveOpenAIModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<OpenAIProviderOptions> | undefined,
      keysFilePath
    );
  }

  if (isCodexModelId(input.modelId)) {
    return resolveCodexModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<CodexProviderOptions> | undefined,
      keysFilePath
    );
  }

  if (isAnthropicModelId(input.modelId)) {
    return resolveAnthropicModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<AnthropicProviderOptions> | undefined,
      keysFilePath
    );
  }

  if (isClaudeCodeModelId(input.modelId)) {
    return resolveClaudeCodeModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<ClaudeCodeProviderOptions> | undefined,
      keysFilePath
    );
  }

  if (isGoogleModelId(input.modelId)) {
    return resolveGoogleModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<GoogleProviderOptions> | undefined,
      keysFilePath
    );
  }

  return {
    ok: false,
    modelId: input.modelId,
    keysFilePath,
    error: {
      code: 'unsupported_model_id',
      message: `Unsupported modelId "${input.modelId}". Available models: ${CuratedModelIds.join(', ')}`,
      modelId: input.modelId,
      supportedModelIds: [...CuratedModelIds],
    },
  };
}

function isOpenAIModelId(value: string): value is OpenAIModelId {
  return value in OPENAI_MODEL_CATALOG;
}

function isCodexModelId(value: string): value is CodexModelId {
  return value in CODEX_MODEL_CATALOG;
}

function isAnthropicModelId(value: string): value is AnthropicModelId {
  return value in ANTHROPIC_MODEL_CATALOG;
}

function isClaudeCodeModelId(value: string): value is ClaudeCodeModelId {
  return value in CLAUDE_CODE_MODEL_CATALOG;
}

function isGoogleModelId(value: string): value is GoogleModelId {
  return value in GOOGLE_MODEL_CATALOG;
}

async function resolveOpenAIModelInput(
  modelId: OpenAIModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<OpenAIProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = OPENAI_MODEL_CATALOG[modelId];
  const model = getModel('openai', providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: 'openai',
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, 'openai');
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: OpenAIProviderOptions = {
    ...credentialsResult.credentials,
    ...buildOpenAICompatibleReasoning(reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: 'openai',
    modelId,
    keysFilePath,
    model,
    providerOptions,
    provider: {
      model,
      providerOptions,
    },
  };
}

async function resolveCodexModelInput(
  modelId: CodexModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<CodexProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = CODEX_MODEL_CATALOG[modelId];
  const model = getModel('codex', providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: 'codex',
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, 'codex');
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: CodexProviderOptions = {
    ...credentialsResult.credentials,
    ...buildOpenAICompatibleReasoning(reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: 'codex',
    modelId,
    keysFilePath,
    model,
    providerOptions,
    provider: {
      model,
      providerOptions,
    },
  };
}

async function resolveAnthropicModelInput(
  modelId: AnthropicModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<AnthropicProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = ANTHROPIC_MODEL_CATALOG[modelId];
  const model = getModel('anthropic', providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: 'anthropic',
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, 'anthropic');
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: AnthropicProviderOptions = {
    ...credentialsResult.credentials,
    ...buildAnthropicAdaptiveThinking(model.id, reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: 'anthropic',
    modelId,
    keysFilePath,
    model,
    providerOptions,
    provider: {
      model,
      providerOptions,
    },
  };
}

async function resolveClaudeCodeModelInput(
  modelId: ClaudeCodeModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<ClaudeCodeProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = CLAUDE_CODE_MODEL_CATALOG[modelId];
  const model = getModel(CLAUDE_CODE_API, providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: CLAUDE_CODE_API,
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, CLAUDE_CODE_API);
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: ClaudeCodeProviderOptions = {
    ...credentialsResult.credentials,
    ...buildAnthropicAdaptiveThinking(model.id, reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: CLAUDE_CODE_API,
    modelId,
    keysFilePath,
    model,
    providerOptions,
    provider: {
      model,
      providerOptions,
    },
  };
}

async function resolveGoogleModelInput(
  modelId: GoogleModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<GoogleProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = GOOGLE_MODEL_CATALOG[modelId];
  const model = getModel('google', providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: 'google',
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, 'google');
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: GoogleProviderOptions = {
    ...credentialsResult.credentials,
    ...buildGoogleThinkingConfig(model.id, reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: 'google',
    modelId,
    keysFilePath,
    model,
    providerOptions,
    provider: {
      model,
      providerOptions,
    },
  };
}

function buildOpenAICompatibleReasoning(
  reasoningEffort: ReasoningEffort | undefined
): Pick<OpenAIProviderOptions, 'reasoning'> | {} {
  if (!reasoningEffort) {
    return {};
  }

  return {
    reasoning: {
      effort: reasoningEffort,
      summary: 'auto',
    },
  };
}

type AnthropicAdaptiveEffort = 'low' | 'medium' | 'high' | 'max';

function buildAnthropicAdaptiveThinking(
  modelId:
    | AnthropicModelId
    | ClaudeCodeModelId
    | Model<'anthropic'>['id']
    | Model<typeof CLAUDE_CODE_API>['id'],
  reasoningEffort: ReasoningEffort | undefined
): Pick<AnthropicProviderOptions, 'thinking' | 'output_config'> {
  const effort = mapAnthropicEffort(modelId, reasoningEffort);

  if (effort) {
    return {
      thinking: {
        type: 'adaptive',
      },
      output_config: {
        effort,
      },
    };
  }

  return {
    thinking: {
      type: 'adaptive',
    },
  };
}

function mapAnthropicEffort(
  modelId:
    | AnthropicModelId
    | ClaudeCodeModelId
    | Model<'anthropic'>['id']
    | Model<typeof CLAUDE_CODE_API>['id'],
  reasoningEffort: ReasoningEffort | undefined
): AnthropicAdaptiveEffort | undefined {
  if (!reasoningEffort) {
    return undefined;
  }

  if (reasoningEffort === 'xhigh') {
    return modelId.includes('opus-4-6') ? 'max' : 'high';
  }

  return reasoningEffort;
}

type GoogleThinkingLevelName = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
type GoogleThinkingLevel = NonNullable<
  NonNullable<GoogleProviderOptions['thinkingConfig']>['thinkingLevel']
>;

function buildGoogleThinkingConfig(
  modelId: GoogleModelId | Model<'google'>['id'],
  reasoningEffort: ReasoningEffort | undefined
): Pick<GoogleProviderOptions, 'thinkingConfig'> | {} {
  const thinkingLevel = mapGoogleThinkingLevel(modelId, reasoningEffort);
  if (!thinkingLevel) {
    return {};
  }

  return {
    thinkingConfig: {
      thinkingLevel: thinkingLevel as GoogleThinkingLevel,
    },
  };
}

function mapGoogleThinkingLevel(
  modelId: GoogleModelId | Model<'google'>['id'],
  reasoningEffort: ReasoningEffort | undefined
): GoogleThinkingLevelName | undefined {
  if (!reasoningEffort) {
    return undefined;
  }

  const supportedLevels = getSupportedGoogleThinkingLevels(modelId);
  const preferredLevels = getPreferredGoogleThinkingLevels(reasoningEffort);
  return preferredLevels.find((level) => supportedLevels.includes(level));
}

function getPreferredGoogleThinkingLevels(
  reasoningEffort: ReasoningEffort
): readonly GoogleThinkingLevelName[] {
  switch (reasoningEffort) {
    case 'low':
      return ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];
    case 'medium':
      return ['LOW', 'MEDIUM', 'HIGH'];
    case 'high':
      return ['MEDIUM', 'HIGH'];
    case 'xhigh':
      return ['HIGH'];
  }
}

function getSupportedGoogleThinkingLevels(
  modelId: GoogleModelId | Model<'google'>['id']
): readonly GoogleThinkingLevelName[] {
  if (modelId.includes('gemini-3.1-pro-preview')) {
    return ['LOW', 'MEDIUM', 'HIGH'];
  }

  if (modelId.includes('gemini-3-flash-preview')) {
    return ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];
  }

  if (modelId.includes('gemini-3.1-flash-lite-preview')) {
    return ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'];
  }

  return ['LOW', 'MEDIUM', 'HIGH'];
}

type PlainObject = Record<string, unknown>;

function mergeProviderOptions<T extends object>(base: T, override?: Partial<T>): T {
  if (!override) {
    return { ...base };
  }

  return mergePlainObjects(
    base as Record<string, unknown>,
    override as Record<string, unknown>
  ) as T;
}

function mergePlainObjects(base: PlainObject, override: PlainObject): PlainObject {
  const merged: PlainObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }

    const currentValue = merged[key];
    if (isPlainObject(currentValue) && isPlainObject(value)) {
      merged[key] = mergePlainObjects(currentValue, value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
