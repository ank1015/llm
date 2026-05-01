/**
 * HTTP API contract shared between the embedded backend (Hono server in the
 * main process) and the React renderer.
 *
 * Pure TypeScript types only — safe to import from any process.
 */

export interface HealthResponse {
  readonly status: 'ok';
  readonly uptimeSeconds: number;
  readonly startedAt: string;
}

export interface EchoRequestBody {
  readonly message: string;
}

export interface EchoResponse {
  readonly received: string;
  readonly receivedAt: string;
}

export type DesktopEntryType = 'file' | 'directory';

export interface DesktopEntryDto {
  readonly name: string;
  readonly path: string;
  readonly type: DesktopEntryType;
  readonly size: number | null;
  readonly updatedAt: string;
  readonly isHidden: boolean;
  readonly isSymlink: boolean;
}

export interface DesktopListResult {
  readonly path: string;
  readonly name: string;
  readonly parent: string | null;
  readonly root: string;
  readonly isRoot: boolean;
  readonly entries: DesktopEntryDto[];
}

export interface DesktopFileDto {
  readonly path: string;
  readonly name: string;
  readonly content: string;
  readonly size: number;
  readonly updatedAt: string;
  readonly isBinary: boolean;
  readonly truncated: boolean;
}

export interface DesktopCreateFolderRequest {
  readonly directoryPath: string;
}

export interface DesktopRenameEntryRequest {
  readonly path: string;
  readonly newName: string;
}

export interface DesktopContextDto {
  readonly currentDirectory: string | null;
  readonly openFiles: DesktopEntryDto[];
  readonly activeFilePath: string | null;
  readonly updatedAt: string;
}

export interface DesktopContextUpdate {
  readonly currentDirectory: string | null;
  readonly openFiles: DesktopEntryDto[];
  readonly activeFilePath: string | null;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
}

export const ApiRoutes = {
  Health: '/api/health',
  Echo: '/api/echo',
  DesktopList: '/api/desktop/list',
  DesktopFile: '/api/desktop/file',
  DesktopRawFile: '/api/desktop/file/raw',
  DesktopContext: '/api/desktop/context',
  DesktopCreateFolder: '/api/desktop/folder',
  DesktopRenameEntry: '/api/desktop/entry/rename',
} as const;

export type ApiRoute = (typeof ApiRoutes)[keyof typeof ApiRoutes];
