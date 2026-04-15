export type DependencyName = 'git' | 'node' | 'python';

export type DependencyCheck = {
  readonly name: DependencyName;
  readonly label: string;
  readonly command: string;
  readonly installed: boolean;
  readonly version?: string;
  readonly executablePath?: string;
  readonly installUrl: string;
};

export type LaunchResult = {
  readonly ok: boolean;
  readonly message: string;
};
