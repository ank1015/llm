import type { DesktopContextDto, DesktopContextUpdate } from '../../shared/api-contract.js';

let context: DesktopContextDto = {
  currentDirectory: null,
  openFiles: [],
  activeFilePath: null,
  updatedAt: new Date(0).toISOString(),
};

export const getDesktopContext = (): DesktopContextDto => context;

export const updateDesktopContext = (next: DesktopContextUpdate): DesktopContextDto => {
  context = {
    currentDirectory: next.currentDirectory,
    openFiles: next.openFiles,
    activeFilePath: next.activeFilePath,
    updatedAt: new Date().toISOString(),
  };

  return context;
};
