import type { ModelsCatalogResponse } from "@ank1015/llm-server/contracts";

import { SERVER_BASE, apiRequestJson } from "./http";

export async function listModels(): Promise<ModelsCatalogResponse> {
  return apiRequestJson<ModelsCatalogResponse>(`${SERVER_BASE}/api/models`);
}
