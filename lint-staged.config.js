export default {
  '*.{ts,tsx,js,jsx,json,md,css}': 'prettier --write',
  '*.{ts,tsx}': [
    'eslint --fix',
    () => 'pnpm typecheck', // Run typecheck on whole project, not individual files
  ],
};
