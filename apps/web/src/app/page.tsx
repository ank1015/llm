'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { SetupAgentStreamEventMap, SetupCheck, SetupStatus } from '@/lib/client-api';
import type { AgentEvent } from '@ank1015/llm-sdk';
import type { FormEvent } from 'react';

import { NewProjectDialog } from '@/components/new-project-dialog';
import { ProjectsBrowser } from '@/components/projects-browser';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  useCancelSetupAgentMutation,
  useCompleteSetupMutation,
  useGatewayLoginMutation,
  useGatewaySessionQuery,
  useSetupStatusQuery,
  useStartSetupAgentMutation,
} from '@/hooks/api';
import { streamSetupAgentRun } from '@/lib/client-api';

export default function Home() {
  const gatewaySession = useGatewaySessionQuery();
  const isAuthenticated = gatewaySession.data?.authenticated === true;
  const setupStatus = useSetupStatusQuery({ enabled: isAuthenticated });

  if (gatewaySession.isLoading || (isAuthenticated && setupStatus.isLoading)) {
    return <GatewayLoadingScreen />;
  }

  if (!gatewaySession.data?.authenticated) {
    return <GatewayLoginScreen />;
  }

  if (!setupStatus.data?.setupComplete) {
    return (
      <SetupScreen
        error={setupStatus.error instanceof Error ? setupStatus.error.message : null}
        isRefreshing={setupStatus.isFetching}
        onRefresh={() => setupStatus.refetch()}
        status={setupStatus.data}
      />
    );
  }

  return <ProjectsHome />;
}

function ProjectsHome() {
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <main className="bg-home-page text-foreground flex min-h-[100dvh] w-full min-w-0 flex-col overflow-hidden transition-colors">
        <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-3 px-3">
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <section className="flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-6 lg:px-8">
          <ProjectsBrowser
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCreateProject={() => setIsCreateDialogOpen(true)}
          />
        </section>
      </main>

      <NewProjectDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreated={(project) => {
          setActiveTab('active');
          router.push(`/${project.id}`);
        }}
      />
    </>
  );
}

function GatewayLoadingScreen() {
  return (
    <main className="bg-home-page text-foreground flex min-h-[100dvh] w-full items-center justify-center px-6 transition-colors">
      <p className="text-muted-foreground text-sm">Checking session...</p>
    </main>
  );
}

function SetupScreen({
  error,
  isRefreshing,
  onRefresh,
  status,
}: {
  error: string | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<unknown> | void;
  status?: SetupStatus;
}) {
  const completeSetup = useCompleteSetupMutation();
  const startSetupAgent = useStartSetupAgentMutation();
  const cancelSetupAgent = useCancelSetupAgentMutation();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [autoCompleteStarted, setAutoCompleteStarted] = useState(false);
  const [liveStatus, setLiveStatus] = useState<SetupStatus | null>(null);
  const [hasAgentRun, setHasAgentRun] = useState(false);
  const [activityLabel, setActivityLabel] = useState<string | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [message, setMessage] = useState('');
  const displayStatus = liveStatus ?? status;
  const checks = displayStatus?.checks ?? [];
  const missing = checks.filter((check) => !check.installed);
  const installedCount = checks.filter((check) => check.installed).length;
  const totalCount = checks.length;
  const progressPercent = totalCount > 0 ? Math.round((installedCount / totalCount) * 100) : 0;
  const isReady = displayStatus?.ready === true;
  const canContinue = hasAgentRun && isReady && displayStatus?.setupComplete !== true;

  useEffect(() => {
    setLiveStatus(null);
  }, [status]);

  useEffect(() => {
    if (!status || hasAgentRun || autoCompleteStarted || completeSetup.isPending) {
      return;
    }

    if (!status.setupComplete && status.ready) {
      setAutoCompleteStarted(true);
      setMessage('Finishing setup...');
      void completeSetup.mutateAsync().catch((error) => {
        setMessage(error instanceof Error ? error.message : 'Failed to finish setup.');
        setAutoCompleteStarted(false);
      });
    }
  }, [autoCompleteStarted, completeSetup, hasAgentRun, status]);

  const onContinue = async () => {
    setMessage('Saving setup...');

    try {
      const result = await completeSetup.mutateAsync();

      if (result.ok) {
        setMessage('');
        return;
      }

      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save setup.');
    }
  };

  const onStartAgent = async () => {
    setLiveStatus(status ?? null);
    setHasAgentRun(true);
    setIsAgentRunning(true);
    setActivityLabel(getNextMissingLabel(status?.checks ?? []));
    setMessage('Starting setup agent...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const started = await startSetupAgent.mutateAsync();
      setAgentRunId(started.run.runId);
      setMessage('');

      await streamSetupAgentRun(
        started.run.runId,
        {
          onEvent: (eventName, data) => {
            if (eventName === 'agent_event') {
              const eventData = data as SetupAgentStreamEventMap['agent_event'];
              handleSetupAgentEvent(eventData.event, {
                fallbackChecks: status?.checks ?? [],
                setActivityLabel,
                setLiveStatus,
              });
              return;
            }

            if (eventName === 'done') {
              const doneData = data as SetupAgentStreamEventMap['done'];
              setActivityLabel(null);
              setMessage(doneData.ready ? 'Setup is ready.' : 'Setup still needs attention.');
            }
          },
        },
        abortController.signal
      );

      await onRefresh();
    } catch (error) {
      if (abortController.signal.aborted) {
        setMessage('Setup agent cancelled.');
      } else {
        setMessage(error instanceof Error ? error.message : 'Setup agent failed.');
      }
    } finally {
      abortControllerRef.current = null;
      setActivityLabel(null);
      setIsAgentRunning(false);
      await onRefresh();
    }
  };

  const onCancelAgent = async () => {
    if (!agentRunId) {
      return;
    }

    abortControllerRef.current?.abort();
    await cancelSetupAgent.mutateAsync(agentRunId).catch(() => undefined);
    setActivityLabel(null);
    setIsAgentRunning(false);
  };

  return (
    <main className="bg-home-page text-foreground flex min-h-[100dvh] w-full min-w-0 flex-col overflow-hidden transition-colors">
      <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-3 px-3">
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-[7vh] sm:px-6">
        <div className="text-center">
          <h1 className="text-5xl font-medium tracking-[-0.05em] text-black dark:text-white">
            Setup
          </h1>
          <p className="text-muted-foreground mt-3 text-sm">Preparing this device.</p>
        </div>

        <div className="mt-9 flex flex-1 flex-col gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-medium text-black/82 dark:text-white/82">
                {installedCount} of {totalCount || 5} dependencies installed
              </span>
              <span className="text-muted-foreground tabular-nums">{progressPercent}%</span>
            </div>
            <div
              className="bg-accent h-2 overflow-hidden rounded-full"
              role="progressbar"
              aria-label="Setup dependency progress"
              aria-valuemin={0}
              aria-valuemax={totalCount || 5}
              aria-valuenow={installedCount}
            >
              <div
                className="h-full rounded-full bg-black transition-[width] duration-500 ease-out dark:bg-white"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid gap-2">
            {checks.length > 0 ? (
              checks.map((check) => <SetupCheckRow key={check.name} check={check} />)
            ) : (
              <div className="border-home-border text-muted-foreground rounded-lg border px-3 py-3 text-sm">
                Checking what this device already has installed...
              </div>
            )}
          </div>

          <div className="flex w-full justify-start">
            <div className="max-w-[92%] rounded-2xl bg-black/[0.035] px-4 py-3 text-[0.98rem] leading-7 text-black/88 dark:bg-white/[0.06] dark:text-white/88">
              {renderSetupAssistantMessage({ checks, error, isAgentRunning, isReady, missing })}
            </div>
          </div>

          {isAgentRunning ? (
            <div className="border-home-border flex items-center gap-3 rounded-lg border px-3 py-3">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/40 opacity-75 dark:bg-white/50" />
                <span className="relative inline-flex size-2.5 rounded-full bg-black dark:bg-white" />
              </span>
              <span className="text-sm font-medium text-black/82 dark:text-white/82">
                {formatSetupActivity(activityLabel)}
              </span>
            </div>
          ) : null}

          {!isReady && !isAgentRunning ? (
            <div className="flex w-full justify-start gap-2">
              <button
                type="button"
                onClick={onStartAgent}
                disabled={startSetupAgent.isPending || checks.length === 0}
                className="bg-foreground text-background hover:opacity-90 disabled:opacity-60 h-10 min-w-24 cursor-pointer rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed"
              >
                {hasAgentRun ? 'Try again' : 'Yes'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex items-center justify-center">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 h-9 cursor-pointer rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? 'Checking...' : 'Check again'}
          </button>
        </div>

        <div className="mt-auto flex min-h-24 flex-col items-center justify-end gap-3">
          <p
            className="text-muted-foreground min-h-5 text-center text-sm"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>

          {isAgentRunning && agentRunId ? (
            <button
              type="button"
              onClick={() => {
                void onCancelAgent();
              }}
              disabled={cancelSetupAgent.isPending}
              className="border-home-border hover:bg-accent h-10 min-w-32 cursor-pointer rounded-md border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          ) : null}

          {canContinue ? (
            <button
              type="button"
              onClick={onContinue}
              disabled={completeSetup.isPending}
              className="bg-foreground text-background hover:opacity-90 disabled:opacity-60 h-10 min-w-32 cursor-pointer rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SetupCheckRow({ check }: { check: SetupCheck }) {
  return (
    <div className="border-home-border flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2">
      <span
        className={[
          'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
          check.installed
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : 'bg-accent text-muted-foreground',
        ].join(' ')}
        aria-hidden="true"
      >
        {check.installed ? '✓' : '•'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-black/86 dark:text-white/86">
          {check.label}
        </div>
        <div className="text-muted-foreground truncate text-xs">
          {check.installed
            ? check.version || check.executablePath || 'Installed'
            : `${check.command} missing`}
        </div>
      </div>
      <span
        className={[
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          check.installed
            ? 'bg-black/[0.06] text-black/72 dark:bg-white/[0.08] dark:text-white/72'
            : 'bg-[#FF6363]/10 text-[#c13e3e] dark:text-[#ff8a8a]',
        ].join(' ')}
      >
        {check.installed ? 'Ready' : 'Missing'}
      </span>
    </div>
  );
}

function handleSetupAgentEvent(
  event: AgentEvent,
  options: {
    fallbackChecks: SetupCheck[];
    setActivityLabel: (label: string | null) => void;
    setLiveStatus: (status: SetupStatus) => void;
  }
): void {
  if (event.type === 'tool_execution_start') {
    if (event.toolName === 'check_setup_requirements') {
      options.setActivityLabel('Checking requirements');
      return;
    }

    if (event.toolName === 'bash') {
      options.setActivityLabel(getInstallLabelFromCommand(event.args, options.fallbackChecks));
    }

    return;
  }

  if (event.type !== 'tool_execution_end' || event.toolName !== 'check_setup_requirements') {
    return;
  }

  const nextStatus = getSetupStatusFromToolResult(event.result);
  if (!nextStatus) {
    return;
  }

  options.setLiveStatus(nextStatus);
  options.setActivityLabel(
    nextStatus.ready ? 'Finalizing setup' : getNextMissingLabel(nextStatus.checks)
  );
}

function getSetupStatusFromToolResult(result: unknown): SetupStatus | null {
  if (!isRecord(result)) {
    return null;
  }

  const details = result.details;
  if (!isRecord(details)) {
    return null;
  }

  const status = details.status;
  if (!isSetupStatusLike(status)) {
    return null;
  }

  return status;
}

function isSetupStatusLike(value: unknown): value is SetupStatus {
  return (
    isRecord(value) &&
    typeof value.setupComplete === 'boolean' &&
    typeof value.ready === 'boolean' &&
    Array.isArray(value.checks)
  );
}

function getInstallLabelFromCommand(args: unknown, fallbackChecks: SetupCheck[]): string {
  const command = getCommandText(args).toLowerCase();

  if (command.includes('chrome-controller')) {
    return 'chrome-controller';
  }

  if (/\b(node|npm|npx)\b/.test(command)) {
    return 'Node.js and npx';
  }

  if (command.includes('python')) {
    return 'Python';
  }

  if (/\bgit\b/.test(command)) {
    return 'Git';
  }

  return getNextMissingLabel(fallbackChecks) ?? 'requirements';
}

function getCommandText(args: unknown): string {
  if (typeof args === 'string') {
    return args;
  }

  if (isRecord(args) && typeof args.command === 'string') {
    return args.command;
  }

  try {
    return JSON.stringify(args);
  } catch {
    return '';
  }
}

function getNextMissingLabel(checks: SetupCheck[]): string | null {
  const missingNames = new Set(
    checks.filter((check) => !check.installed).map((check) => check.name)
  );

  if (missingNames.has('node') || missingNames.has('npx')) {
    return 'Node.js and npx';
  }

  const next = checks.find((check) => !check.installed);
  return next?.label ?? null;
}

function formatSetupActivity(activityLabel: string | null): string {
  if (!activityLabel) {
    return 'Installing...';
  }

  if (activityLabel === 'Checking requirements' || activityLabel === 'Finalizing setup') {
    return `${activityLabel}...`;
  }

  return `Installing ${activityLabel}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function renderSetupAssistantMessage({
  checks,
  error,
  isAgentRunning,
  isReady,
  missing,
}: {
  checks: SetupStatus['checks'];
  error: string | null;
  isAgentRunning: boolean;
  isReady: boolean;
  missing: SetupStatus['checks'];
}): string {
  if (error) {
    return error;
  }

  if (checks.length === 0) {
    return 'Checking what this device already has installed...';
  }

  if (isReady) {
    return 'Everything needed is installed. Finishing setup now.';
  }

  if (isAgentRunning) {
    return 'I am installing the missing requirements now. Progress will update as each dependency becomes available.';
  }

  const names = missing.map((check) => check.label).join(', ');
  return `The following requirements are not present: ${names}.\n\nWould you like me to install them?`;
}

function GatewayLoginScreen() {
  const login = useGatewayLoginMutation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('Signing in...');

    try {
      const result = await login.mutateAsync({ username, password });

      if (result.ok) {
        setPassword('');
        setMessage('');
        return;
      }

      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to log in.');
    }
  };

  return (
    <main className="bg-home-page text-foreground flex min-h-[100dvh] w-full min-w-0 flex-col overflow-hidden transition-colors">
      <header className="flex h-12 w-full min-w-0 shrink-0 items-center gap-3 px-3">
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-1 items-start justify-center px-4 pt-[14vh] sm:px-6">
        <div className="flex w-full max-w-[22rem] flex-col items-center gap-8">
          <div className="text-center">
            <h1 className="text-5xl font-medium tracking-[-0.05em] text-black dark:text-white">
              Welcome
            </h1>
            <p className="text-muted-foreground mt-3 text-sm">This app is still in development.</p>
          </div>

          <form className="flex w-full flex-col gap-4" onSubmit={onSubmit}>
            <label className="flex flex-col gap-2 text-sm font-medium text-black/70 dark:text-white/72">
              Username
              <input
                className="border-home-border bg-home-input text-foreground focus:ring-ring/50 h-10 rounded-md border px-3 text-sm outline-none transition focus:ring-2"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-2 text-sm font-medium text-black/70 dark:text-white/72">
              Password
              <input
                className="border-home-border bg-home-input text-foreground focus:ring-ring/50 h-10 rounded-md border px-3 text-sm outline-none transition focus:ring-2"
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button
              type="submit"
              disabled={login.isPending}
              className="bg-foreground text-background hover:opacity-90 disabled:opacity-60 mt-1 h-10 cursor-pointer rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed"
            >
              Login
            </button>

            <p
              className="text-muted-foreground min-h-5 text-center text-sm"
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
