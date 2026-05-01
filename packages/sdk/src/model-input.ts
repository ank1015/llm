import { getModel } from '@ank1015/llm-core';

import { getSdkConfig } from './config.js';
import { resolveProviderCredentials } from './keys.js';

import type { ResolveProviderCredentialsError } from './keys.js';
import type {
  AnthropicProviderOptions,
  Api,
  AzureOpenAIProviderOptions,
  GoogleProviderOptions,
  Model,
  OpenAIProviderOptions,
  Provider,
} from '@ank1015/llm-core';

export const ReasoningEfforts = ['low', 'medium', 'high', 'xhigh'] as const;

export type ReasoningEffort = (typeof ReasoningEfforts)[number];

const OPENAI_API = 'openai' as const;
const AZURE_OPENAI_API = 'azure-openai' as const;

const OPENAI_MODEL_CATALOG = {
  'openai/gpt-5.4': 'gpt-5.4',
  'openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'openai/gpt-5.4-pro': 'gpt-5.4-pro',
  'openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'openai/gpt-5.4-nano': 'gpt-5.4-nano',
} as const;

const AZURE_OPENAI_MODEL_CATALOG = {
  'azure-openai/gpt-5.4': 'gpt-5.4',
  'azure-openai/gpt-5.3-codex': 'gpt-5.3-codex',
  'azure-openai/gpt-5.4-pro': 'gpt-5.4-pro',
  'azure-openai/gpt-5.4-mini': 'gpt-5.4-mini',
  'azure-openai/gpt-5.4-nano': 'gpt-5.4-nano',
} as const;

const ANTHROPIC_MODEL_CATALOG = {
  'anthropic/claude-opus-4-6': 'claude-opus-4-6',
  'anthropic/claude-sonnet-4-6': 'claude-sonnet-4-6',
} as const;

const GOOGLE_MODEL_CATALOG = {
  'google/gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview': 'gemini-3-flash-preview',
  'google/gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite-preview',
} as const;

export type OpenAIModelId = keyof typeof OPENAI_MODEL_CATALOG;
export type AzureOpenAIModelId = keyof typeof AZURE_OPENAI_MODEL_CATALOG;
export type AnthropicModelId = keyof typeof ANTHROPIC_MODEL_CATALOG;
export type GoogleModelId = keyof typeof GOOGLE_MODEL_CATALOG;
export type CuratedModelId =
  | OpenAIModelId
  | AzureOpenAIModelId
  | AnthropicModelId
  | GoogleModelId;

export const CuratedModelIds = [
  ...Object.keys(OPENAI_MODEL_CATALOG),
  ...Object.keys(AZURE_OPENAI_MODEL_CATALOG),
  ...Object.keys(ANTHROPIC_MODEL_CATALOG),
  ...Object.keys(GOOGLE_MODEL_CATALOG),
] as CuratedModelId[];

export interface SupportedProviderOptionsByApi {
  openai: OpenAIProviderOptions;
  [AZURE_OPENAI_API]: AzureOpenAIProviderOptions;
  anthropic: AnthropicProviderOptions;
  google: GoogleProviderOptions;
}

export type ProviderOptionsForApi<TApi extends keyof SupportedProviderOptionsByApi> =
  SupportedProviderOptionsByApi[TApi];

export type SupportedProviderOptions =
  SupportedProviderOptionsByApi[keyof SupportedProviderOptionsByApi];

export type ProviderOptionsForModelId<TModelId extends string> = TModelId extends OpenAIModelId
  ? OpenAIProviderOptions
  : TModelId extends AzureOpenAIModelId
    ? AzureOpenAIProviderOptions
    : TModelId extends AnthropicModelId
      ? AnthropicProviderOptions
      : TModelId extends GoogleModelId
        ? GoogleProviderOptions
        : SupportedProviderOptions;

export interface ResolveModelInputInput<TModelId extends string = string> {
  modelId: TModelId;
  reasoningEffort?: ReasoningEffort;
  conversationId?: string;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string;
}

export interface ResolveGatewayModelInputInput<TModelId extends string = string> {
  modelId: TModelId;
  reasoningEffort?: ReasoningEffort;
  conversationId?: string;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
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
  api:
    | typeof OPENAI_API
    | typeof AZURE_OPENAI_API
    | 'anthropic'
    | 'google';
  providerModelId: string;
}

type OpenAICredentialsError = ResolveProviderCredentialsError<typeof OPENAI_API>;
type AzureOpenAICredentialsError = ResolveProviderCredentialsError<typeof AZURE_OPENAI_API>;
type AnthropicCredentialsError = ResolveProviderCredentialsError<'anthropic'>;
type GoogleCredentialsError = ResolveProviderCredentialsError<'google'>;

export type ResolveModelInputError =
  | UnsupportedModelIdError
  | CoreModelNotFoundError
  | OpenAICredentialsError
  | AzureOpenAICredentialsError
  | AnthropicCredentialsError
  | GoogleCredentialsError;

export interface ResolvedOpenAIModelInput {
  ok: true;
  api: typeof OPENAI_API;
  modelId: OpenAIModelId;
  keysFilePath: string;
  model: Model<typeof OPENAI_API>;
  providerOptions: OpenAIProviderOptions;
  provider: Provider<typeof OPENAI_API>;
}

export interface ResolvedAzureOpenAIModelInput {
  ok: true;
  api: typeof AZURE_OPENAI_API;
  modelId: AzureOpenAIModelId;
  keysFilePath: string;
  model: Model<typeof AZURE_OPENAI_API>;
  providerOptions: AzureOpenAIProviderOptions;
  provider: Provider<typeof AZURE_OPENAI_API>;
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
  | ResolvedAzureOpenAIModelInput
  | ResolvedAnthropicModelInput
  | ResolvedGoogleModelInput
  | ResolveModelInputFailure;

export type ResolveGatewayModelInputError =
  | UnsupportedModelIdError
  | CoreModelNotFoundError;

export interface ResolvedGatewayModelInput<TApi extends Api = Api> {
  ok: true;
  api: TApi;
  modelId: CuratedModelId;
  providerModelId: string;
  model: Model<TApi>;
  providerOptions: Record<string, unknown>;
  provider: Provider<TApi>;
}

export interface ResolveGatewayModelInputFailure {
  ok: false;
  modelId: string;
  error: ResolveGatewayModelInputError;
}

export type ResolveGatewayModelInputResult =
  | ResolvedGatewayModelInput
  | ResolveGatewayModelInputFailure;

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

  if (isAzureOpenAIModelId(input.modelId)) {
    return resolveAzureOpenAIModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<AzureOpenAIProviderOptions> | undefined,
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

export function resolveGatewayModelInput<TModelId extends string>(
  input: ResolveGatewayModelInputInput<TModelId>
): ResolveGatewayModelInputResult {
  if (isOpenAIModelId(input.modelId)) {
    return resolveOpenAIGatewayModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<OpenAIProviderOptions> | undefined
    );
  }

  if (isAzureOpenAIModelId(input.modelId)) {
    return resolveAzureOpenAIGatewayModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<AzureOpenAIProviderOptions> | undefined
    );
  }

  if (isAnthropicModelId(input.modelId)) {
    return resolveAnthropicGatewayModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<AnthropicProviderOptions> | undefined
    );
  }

  if (isGoogleModelId(input.modelId)) {
    return resolveGoogleGatewayModelInput(
      input.modelId,
      input.reasoningEffort,
      input.overrideProviderSetting as Partial<GoogleProviderOptions> | undefined
    );
  }

  return {
    ok: false,
    modelId: input.modelId,
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

function isAzureOpenAIModelId(value: string): value is AzureOpenAIModelId {
  return value in AZURE_OPENAI_MODEL_CATALOG;
}

function isAnthropicModelId(value: string): value is AnthropicModelId {
  return value in ANTHROPIC_MODEL_CATALOG;
}

function isGoogleModelId(value: string): value is GoogleModelId {
  return value in GOOGLE_MODEL_CATALOG;
}

function resolveOpenAIGatewayModelInput(
  modelId: OpenAIModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<OpenAIProviderOptions> | undefined
): ResolveGatewayModelInputResult {
  const providerModelId = OPENAI_MODEL_CATALOG[modelId];
  const model = getModel(OPENAI_API, providerModelId);

  if (!model) {
    return coreModelNotFound(modelId, OPENAI_API, providerModelId);
  }

  const providerOptions = sanitizeGatewayProviderOptions(
    mergeProviderOptions(buildOpenAICompatibleReasoning(reasoningEffort), overrideProviderSetting)
  );

  return createResolvedGatewayModelInput({
    api: OPENAI_API,
    modelId,
    providerModelId,
    model,
    providerOptions,
  });
}

function resolveAzureOpenAIGatewayModelInput(
  modelId: AzureOpenAIModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<AzureOpenAIProviderOptions> | undefined
): ResolveGatewayModelInputResult {
  const providerModelId = AZURE_OPENAI_MODEL_CATALOG[modelId];
  const model = getModel(AZURE_OPENAI_API, providerModelId);

  if (!model) {
    return coreModelNotFound(modelId, AZURE_OPENAI_API, providerModelId);
  }

  const providerOptions = sanitizeGatewayProviderOptions(
    mergeProviderOptions(buildOpenAICompatibleReasoning(reasoningEffort), overrideProviderSetting)
  );

  return createResolvedGatewayModelInput({
    api: AZURE_OPENAI_API,
    modelId,
    providerModelId,
    model,
    providerOptions,
  });
}

function resolveAnthropicGatewayModelInput(
  modelId: AnthropicModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<AnthropicProviderOptions> | undefined
): ResolveGatewayModelInputResult {
  const providerModelId = ANTHROPIC_MODEL_CATALOG[modelId];
  const model = getModel('anthropic', providerModelId);

  if (!model) {
    return coreModelNotFound(modelId, 'anthropic', providerModelId);
  }

  const providerOptions = sanitizeGatewayProviderOptions(
    mergeProviderOptions(buildAnthropicAdaptiveThinking(model.id, reasoningEffort), overrideProviderSetting)
  );

  return createResolvedGatewayModelInput({
    api: 'anthropic',
    modelId,
    providerModelId,
    model,
    providerOptions,
  });
}

function resolveGoogleGatewayModelInput(
  modelId: GoogleModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<GoogleProviderOptions> | undefined
): ResolveGatewayModelInputResult {
  const providerModelId = GOOGLE_MODEL_CATALOG[modelId];
  const model = getModel('google', providerModelId);

  if (!model) {
    return coreModelNotFound(modelId, 'google', providerModelId);
  }

  const providerOptions = sanitizeGatewayProviderOptions(
    mergeProviderOptions(buildGoogleThinkingConfig(model.id, reasoningEffort), overrideProviderSetting)
  );

  return createResolvedGatewayModelInput({
    api: 'google',
    modelId,
    providerModelId,
    model,
    providerOptions,
  });
}

function createResolvedGatewayModelInput<TApi extends Api>(input: {
  api: TApi;
  modelId: CuratedModelId;
  providerModelId: string;
  model: Model<TApi>;
  providerOptions: Record<string, unknown>;
}): ResolvedGatewayModelInput<TApi> {
  return {
    ok: true,
    api: input.api,
    modelId: input.modelId,
    providerModelId: input.providerModelId,
    model: input.model,
    providerOptions: input.providerOptions,
    provider: {
      model: input.model,
      providerOptions: input.providerOptions as never,
    },
  };
}

function coreModelNotFound(
  modelId: CuratedModelId,
  api: CoreModelNotFoundError['api'],
  providerModelId: string
): ResolveGatewayModelInputFailure {
  return {
    ok: false,
    modelId,
    error: {
      code: 'core_model_not_found',
      message: `Core model "${providerModelId}" was not found for ${modelId}`,
      modelId,
      api,
      providerModelId,
    },
  };
}

async function resolveOpenAIModelInput(
  modelId: OpenAIModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<OpenAIProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = OPENAI_MODEL_CATALOG[modelId];
  const model = getModel(OPENAI_API, providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core OpenAI model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: OPENAI_API,
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, OPENAI_API);
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const baseProviderOptions: OpenAIProviderOptions = {
    apiKey: credentialsResult.credentials.apiKey,
    ...buildOpenAICompatibleReasoning(reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: OPENAI_API,
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

async function resolveAzureOpenAIModelInput(
  modelId: AzureOpenAIModelId,
  reasoningEffort: ReasoningEffort | undefined,
  overrideProviderSetting: Partial<AzureOpenAIProviderOptions> | undefined,
  keysFilePath: string
): Promise<ResolveModelInputResult> {
  const providerModelId = AZURE_OPENAI_MODEL_CATALOG[modelId];
  const model = getModel(AZURE_OPENAI_API, providerModelId);

  if (!model) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: {
        code: 'core_model_not_found',
        message: `Core Azure OpenAI model "${providerModelId}" was not found for ${modelId}`,
        modelId,
        api: AZURE_OPENAI_API,
        providerModelId,
      },
    };
  }

  const credentialsResult = await resolveProviderCredentials(keysFilePath, AZURE_OPENAI_API);
  if (!credentialsResult.ok) {
    return {
      ok: false,
      modelId,
      keysFilePath,
      error: credentialsResult.error,
    };
  }

  const endpoint = parseAzureOpenAIDeploymentUrl(credentialsResult.credentials.azureDeploymentUrl);
  const baseProviderOptions: AzureOpenAIProviderOptions = {
    apiKey: credentialsResult.credentials.apiKey,
    azureBaseURL: endpoint.azureBaseURL,
    ...(endpoint.azureApiVersion ? { azureApiVersion: endpoint.azureApiVersion } : {}),
    azureDeploymentName: providerModelId,
    ...buildOpenAICompatibleReasoning(reasoningEffort),
  };
  const providerOptions = mergeProviderOptions(baseProviderOptions, overrideProviderSetting);

  return {
    ok: true,
    api: AZURE_OPENAI_API,
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

function parseAzureOpenAIDeploymentUrl(deploymentUrl: string): {
  azureBaseURL: string;
  azureApiVersion?: string;
} {
  const url = new URL(deploymentUrl);
  const apiVersion = url.searchParams.get('api-version')?.trim() || undefined;
  let pathname = url.pathname.replace(/\/+$/u, '');
  if (pathname.endsWith('/responses')) {
    pathname = pathname.slice(0, -'/responses'.length);
  }
  if (!pathname || !pathname.includes('/openai')) {
    throw new Error('Azure OpenAI deployment URL must include an /openai path.');
  }

  return {
    azureBaseURL: `${url.origin}${pathname}`,
    ...(apiVersion ? { azureApiVersion: apiVersion } : {}),
  };
}

type AnthropicAdaptiveEffort = 'low' | 'medium' | 'high' | 'max';
const ANTHROPIC_EPHEMERAL_CACHE_CONTROL = { type: 'ephemeral' } as const;

function buildAnthropicAdaptiveThinking(
  modelId: AnthropicModelId | Model<'anthropic'>['id'],
  reasoningEffort: ReasoningEffort | undefined
): Pick<AnthropicProviderOptions, 'thinking' | 'output_config' | 'cache_control'> {
  const effort = mapAnthropicEffort(modelId, reasoningEffort);

  if (effort) {
    return {
      thinking: {
        type: 'adaptive',
      },
      cache_control: ANTHROPIC_EPHEMERAL_CACHE_CONTROL,
      output_config: {
        effort,
      },
    };
  }

  return {
    thinking: {
      type: 'adaptive',
    },
    cache_control: ANTHROPIC_EPHEMERAL_CACHE_CONTROL,
  };
}

function mapAnthropicEffort(
  modelId: AnthropicModelId | Model<'anthropic'>['id'],
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

const GATEWAY_FORBIDDEN_PROVIDER_OPTION_KEYS = new Set([
  'accessToken',
  'adminToken',
  'apiKey',
  'authorization',
  'billingHeader',
  'cookie',
  'fetch',
  'headers',
  'oauthToken',
  'refreshToken',
  'signal',
]);

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

function sanitizeGatewayProviderOptions(input: object): Record<string, unknown> {
  return sanitizeGatewayProviderOptionObject(input as Record<string, unknown>);
}

function sanitizeGatewayProviderOptionObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (GATEWAY_FORBIDDEN_PROVIDER_OPTION_KEYS.has(key) || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value.map((item) =>
        isPlainObject(item) ? sanitizeGatewayProviderOptionObject(item) : item
      );
      continue;
    }

    if (isPlainObject(value)) {
      output[key] = sanitizeGatewayProviderOptionObject(value);
      continue;
    }

    output[key] = value;
  }

  return output;
}

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
