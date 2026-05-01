import { verifyAdminSessionCookie } from '../../auth/admin-session.js';

import type { GatewayEnv } from '../../context.js';
import type { Context } from 'hono';

export const ADMIN_DASHBOARD_PATH = '/admin/dashboard';
export const ADMIN_LOGIN_PATH = '/admin/login';

export async function hasAdminSession(c: Context<GatewayEnv>): Promise<boolean> {
  return verifyAdminSessionCookie(c.get('services').config, c.req.header('Cookie') ?? undefined);
}

export async function redirectIfMissingSession(
  c: Context<GatewayEnv>
): Promise<Response | undefined> {
  if (await hasAdminSession(c)) {
    return undefined;
  }

  return c.redirect(ADMIN_LOGIN_PATH, 303);
}

export function getFormValue(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (Array.isArray(value)) {
    return stringifyFormValue(value[0]);
  }

  return stringifyFormValue(value);
}

function stringifyFormValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
