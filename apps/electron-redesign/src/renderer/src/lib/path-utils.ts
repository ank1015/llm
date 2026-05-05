export const getPathBasename = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');

  return segments[segments.length - 1] ?? path;
};

export const getPathExtension = (path: string): string => {
  const basename = getPathBasename(path);
  const dotIndex = basename.lastIndexOf('.');

  if (dotIndex === -1 || dotIndex === basename.length - 1) {
    return '';
  }

  return basename.slice(dotIndex + 1).toLowerCase();
};
