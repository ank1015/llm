import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';


import type { TerminalPtyFactory, TerminalPtyProcess } from './terminal-registry.js';
import type { ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';

type Disposable = {
  dispose: () => void;
};

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

const PYTHON_PTY_BRIDGE = `
import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios

shell = sys.argv[1]
args = sys.argv[1:]
cols = int(os.environ.get("LLM_TERMINAL_COLS", "120"))
rows = int(os.environ.get("LLM_TERMINAL_ROWS", "30"))
control_fd = 3

pid, master_fd = pty.fork()

if pid == 0:
    os.execv(shell, args)

def apply_size(next_cols, next_rows):
    packed = struct.pack("HHHH", max(1, next_rows), max(1, next_cols), 0, 0)
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, packed)
    try:
        os.kill(pid, signal.SIGWINCH)
    except ProcessLookupError:
        pass

apply_size(cols, rows)

stdin_fd = sys.stdin.fileno()
stdout_fd = sys.stdout.fileno()
control_buffer = b""

selector = selectors.DefaultSelector()
selector.register(master_fd, selectors.EVENT_READ, "pty")
selector.register(stdin_fd, selectors.EVENT_READ, "stdin")
selector.register(control_fd, selectors.EVENT_READ, "control")

def forward_signal(signum, frame):
    try:
        os.kill(pid, signum)
    except ProcessLookupError:
        pass

for forwarded_signal in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT, signal.SIGQUIT):
    signal.signal(forwarded_signal, forward_signal)

def exit_for_status(status):
    if os.WIFEXITED(status):
        sys.exit(os.WEXITSTATUS(status))
    if os.WIFSIGNALED(status):
        os.kill(os.getpid(), os.WTERMSIG(status))
    sys.exit(1)

while True:
    try:
        events = selector.select()
    except OSError:
        break

    for key, _ in events:
        source = key.data

        try:
            if source == "pty":
                chunk = os.read(master_fd, 4096)
                if not chunk:
                    raise OSError(errno.EIO, "pty closed")
                os.write(stdout_fd, chunk)
            elif source == "stdin":
                chunk = os.read(stdin_fd, 4096)
                if not chunk:
                    selector.unregister(stdin_fd)
                else:
                    os.write(master_fd, chunk)
            else:
                chunk = os.read(control_fd, 4096)
                if not chunk:
                    selector.unregister(control_fd)
                    continue
                control_buffer += chunk
                while b"\\n" in control_buffer:
                    line, control_buffer = control_buffer.split(b"\\n", 1)
                    if not line.strip():
                        continue
                    try:
                        message = json.loads(line.decode("utf-8"))
                    except Exception:
                        continue
                    if message.get("type") == "resize":
                        try:
                            cols = int(message.get("cols", cols))
                            rows = int(message.get("rows", rows))
                            apply_size(cols, rows)
                        except Exception:
                            pass
        except OSError as error:
            if source == "pty" and getattr(error, "errno", None) in (errno.EIO, errno.EBADF):
                _, status = os.waitpid(pid, 0)
                exit_for_status(status)
            raise

    finished_pid, status = os.waitpid(pid, os.WNOHANG)
    if finished_pid == pid:
        exit_for_status(status)
`;

function resolvePythonExecutable(): string | null {
  if (existsSync('/usr/bin/python3')) {
    return '/usr/bin/python3';
  }

  try {
    const result = spawnSync('which', ['python3'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (result.status !== 0 || !result.stdout) {
      return null;
    }

    const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
    return firstMatch && existsSync(firstMatch) ? firstMatch : null;
  } catch {
    return null;
  }
}

function normalizeSignal(signal?: string): number | undefined {
  if (!signal) {
    return undefined;
  }

  switch (signal) {
    case 'SIGHUP':
      return 1;
    case 'SIGINT':
      return 2;
    case 'SIGQUIT':
      return 3;
    case 'SIGKILL':
      return 9;
    case 'SIGTERM':
      return 15;
    default:
      return undefined;
  }
}

class PythonPtyProcess implements TerminalPtyProcess {
  readonly pid: number;

  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<
    (event: { exitCode: number; signal?: number }) => void
  >();
  private exited = false;

  constructor(
    private readonly child: ChildProcess,
    private readonly controlPipe: Writable
  ) {
    this.pid = child.pid ?? -1;

    child.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8');
      if (!data) {
        return;
      }

      for (const listener of this.dataListeners) {
        listener(data);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString('utf-8');
      if (!data) {
        return;
      }

      for (const listener of this.dataListeners) {
        listener(data);
      }
    });

    child.on('exit', (exitCode, signal) => {
      if (this.exited) {
        return;
      }

      this.exited = true;
      const event: { exitCode: number; signal?: number } = {
        exitCode: Number.isFinite(exitCode) ? (exitCode ?? 0) : 0,
      };
      const normalizedSignal = normalizeSignal(signal ?? undefined);
      if (normalizedSignal !== undefined) {
        event.signal = normalizedSignal;
      }

      for (const listener of this.exitListeners) {
        listener(event);
      }
    });
  }

  write(data: string): void {
    if (this.child.stdin?.writable !== true) {
      return;
    }

    this.child.stdin.write(data);
  }

  resize(cols: number, rows: number): void {
    if (!this.controlPipe.writable) {
      return;
    }

    this.controlPipe.write(
      `${JSON.stringify({
        type: 'resize',
        cols: Math.max(1, Math.floor(cols || DEFAULT_COLS)),
        rows: Math.max(1, Math.floor(rows || DEFAULT_ROWS)),
      })}\n`
    );
  }

  kill(signal?: string): void {
    this.child.kill(signal as NodeJS.Signals | undefined);
  }

  onData(listener: (data: string) => void): Disposable {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void): Disposable {
    this.exitListeners.add(listener);
    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }
}

export function createPythonPtyFactory(): TerminalPtyFactory | null {
  if (process.platform === 'win32') {
    return null;
  }

  const pythonExecutable = resolvePythonExecutable();
  if (!pythonExecutable) {
    return null;
  }

  return ({ shell, args, cwd, env, cols, rows }) => {
    const child = spawn(pythonExecutable, ['-u', '-c', PYTHON_PTY_BRIDGE, shell, ...args], {
      cwd,
      env: {
        ...env,
        LLM_TERMINAL_COLS: `${Math.max(1, Math.floor(cols || DEFAULT_COLS))}`,
        LLM_TERMINAL_ROWS: `${Math.max(1, Math.floor(rows || DEFAULT_ROWS))}`,
      },
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    });

    const controlPipe = child.stdio[3];
    if (!controlPipe || typeof (controlPipe as Writable).write !== 'function') {
      child.kill();
      throw new Error('Failed to initialize the terminal resize control pipe.');
    }

    return new PythonPtyProcess(child, controlPipe as Writable);
  };
}
