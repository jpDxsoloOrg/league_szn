import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// Keeps a rule's options and whether it is off, changing only error to warn.
const downgradeToWarning = (setting) => {
  if (Array.isArray(setting)) return setting[0] === 'error' ? ['warn', ...setting.slice(1)] : setting;
  return setting === 'error' ? 'warn' : setting;
};

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warnings for now: existing pages have findings to work through.
      ...Object.fromEntries(
        Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([rule, setting]) => [
          rule,
          downgradeToWarning(setting),
        ]),
      ),
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
