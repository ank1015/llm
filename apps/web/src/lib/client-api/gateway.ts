import { apiRequestJson, SERVER_BASE } from './http';

import type { GatewayLoginResult, GatewaySession } from '@ank1015/llm-server/contracts';

const GATEWAY_BASE = `${SERVER_BASE}/api/gateway`;

export type GatewayLoginInput = {
  username: string;
  password: string;
};

export async function getGatewaySession(): Promise<GatewaySession> {
  return apiRequestJson<GatewaySession>(`${GATEWAY_BASE}/session`, {
    method: 'GET',
  });
}

export async function loginGateway(input: GatewayLoginInput): Promise<GatewayLoginResult> {
  return apiRequestJson<GatewayLoginResult>(`${GATEWAY_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
