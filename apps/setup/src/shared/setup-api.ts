export type DependencyName = 'git' | 'node' | 'npm' | 'npx';

export type DependencyCheck = {
  readonly name: DependencyName;
  readonly label: string;
  readonly command: string;
  readonly installed: boolean;
  readonly version?: string;
  readonly installUrl: string;
};

export type LaunchResult = {
  readonly ok: boolean;
  readonly message: string;
};
