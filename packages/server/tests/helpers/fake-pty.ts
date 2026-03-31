import type {
  TerminalPtyFactory,
  TerminalPtyProcess,
} from '../../src/core/terminal/terminal-registry.js';

type DataListener = (data: string) => void;
type ExitListener = (event: { exitCode: number; signal?: number }) => void;

export class FakePtyProcess implements TerminalPtyProcess {
  readonly writes: string[] = [];
  readonly resizeCalls: Array<{ cols: number; rows: number }> = [];
  readonly killSignals: Array<string | undefined> = [];

  private readonly dataListeners = new Set<DataListener>();
  private readonly exitListeners = new Set<ExitListener>();

  constructor(
    readonly pid: number,
    readonly config: Parameters<TerminalPtyFactory>[0]
  ) {}

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizeCalls.push({ cols, rows });
  }

  kill(signal?: string): void {
    this.killSignals.push(signal);
  }

  onData(listener: DataListener) {
    this.dataListeners.add(listener);
    return {
      dispose: () => {
        this.dataListeners.delete(listener);
      },
    };
  }

  onExit(listener: ExitListener) {
    this.exitListeners.add(listener);
    return {
      dispose: () => {
        this.exitListeners.delete(listener);
      },
    };
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of this.exitListeners) {
      listener(event);
    }
  }
}

export function createFakePtyFactory(): {
  factory: TerminalPtyFactory;
  instances: FakePtyProcess[];
} {
  const instances: FakePtyProcess[] = [];
  let nextPid = 1000;

  const factory: TerminalPtyFactory = (config) => {
    const pty = new FakePtyProcess(nextPid++, config);
    instances.push(pty);
    return pty;
  };

  return {
    factory,
    instances,
  };
}
