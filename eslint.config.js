import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-config-prettier';

export default [
  // Ignore patterns
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      '**/web-build/**',
      '**/android/**',
      '**/ios/**',
    ],
  },

  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      unicorn,
      sonarjs,
    },
    rules: {
      // Disable base rules that TypeScript handles
      'no-unused-vars': 'off',
      'no-undef': 'off',

      // TypeScript rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_|^e$|^err$|^error$',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'warn',

      // Import rules
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-cycle': 'warn',
      'import/first': 'error',

      // Unicorn rules - naming and best practices
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-null': 'off', // Allow null
      'unicorn/prevent-abbreviations': 'off', // Too strict
      'unicorn/no-array-reduce': 'off', // Reduce is fine
      'unicorn/no-array-for-each': 'off', // forEach is fine
      'unicorn/prefer-module': 'off', // Allow CommonJS in config files
      'unicorn/prefer-top-level-await': 'off', // Not always applicable

      // SonarJS rules - complexity and code smells
      'sonarjs/cognitive-complexity': ['warn', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'warn',

      // General best practices
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Test files - relaxed rules
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      'no-console': 'off',
    },
  },

  // Config files - relaxed rules
  {
    files: ['*.config.js', '*.config.ts', '*.config.mjs'],
    rules: {
      'unicorn/filename-case': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // Expo Router route filenames use framework-specific conventions.
  {
    files: ['**/src/app/**/_layout.tsx', '**/src/app/**/+*.tsx', '**/src/app/**/[[]*[]].tsx'],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },

  // React Native's published sources still contain syntax that the import-cycle rule
  // tries to parse poorly; keep the rest of the import rules enabled.
  {
    files: ['packages/native-app/**/*.{ts,tsx}'],
    rules: {
      'import/no-cycle': 'off',
    },
  },

  // Provider files - complex streaming logic
  {
    files: ['**/providers/**/stream.ts', '**/providers/**/utils.ts'],
    rules: {
      'sonarjs/cognitive-complexity': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // React components - return types inferred from JSX
  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // SDK stream - complex SSE parsing
  {
    files: ['**/sdk/src/llm/stream.ts'],
    rules: {
      'sonarjs/cognitive-complexity': 'off',
    },
  },

  // Prettier - must be last to override formatting rules
  prettier,
];
