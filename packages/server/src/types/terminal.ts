

export type TerminalStatus = 'running' | 'exited';

export interface TerminalSummary {
  id: string;
  title: string;
  status: TerminalStatus;
  projectId: string;
  artifactId: string;
  cols: number;
  rows: number;
  createdAt: string;
  lastActiveAt: string;
  exitCode: number | null;
  signal: string | null;
  exitedAt: string | null;
}

export interface CreateTerminalOptions {
  cols?: number;
  rows?: number;
}

export interface TerminalMetadata extends TerminalSummary {
  cwdAtLaunch: string;
  shell: string;
}
