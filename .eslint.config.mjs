// eslint.config.mjs - ESLint Flat Config形式
import js from '@eslint/js';
import nextConfig from 'eslint-config-next';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // JavaScript推奨設定
  js.configs.recommended,

  // TypeScript推奨設定
  ...tseslint.configs.recommended,

  // Next.js設定
  ...nextConfig,

  // Prettier連携（競合ルールを無効化）
  prettierConfig,

  // カスタム設定
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': (await import('eslint-plugin-react-hooks')).default,
      import: (await import('eslint-plugin-import')).default,
      'unused-imports': (await import('eslint-plugin-unused-imports')).default,
      tailwindcss: (await import('eslint-plugin-tailwindcss')).default,
      'jsx-a11y': (await import('eslint-plugin-jsx-a11y')).default,
      prettier: (await import('eslint-plugin-prettier')).default,
    },
    rules: {
      // TypeScript関連
      '@typescript-eslint/no-unused-vars': 'off', // unused-importsで管理
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Import関連
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off', // TypeScriptで解決

      // 未使用のimport削除
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Tailwind CSS
      'tailwindcss/classnames-order': 'warn',
      'tailwindcss/no-custom-classname': 'warn',
      'tailwindcss/enforces-negative-arbitrary-values': 'error',

      // Prettier
      'prettier/prettier': 'error',

      // 一般的なルール
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',

      // React関連
      'react/prop-types': 'off', // TypeScriptで型管理
      'react/react-in-jsx-scope': 'off', // Next.js不要
      'react/display-name': 'off',
      'react/jsx-curly-brace-presence': ['error', 'never'],
      'react/self-closing-comp': 'error',

      // Next.js関連
      '@next/next/no-img-element': 'error',
      '@next/next/no-html-link-for-pages': 'error',

      // アクセシビリティ
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },

  // 特定ファイル用の設定上書き
  {
    files: ['**/*.config.{js,mjs,ts}', '**/next.config.{js,mjs,ts}'],
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // テストファイル用の設定
  {
    files: ['**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // 無視するファイル
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'public/**',
      '*.min.js',
      'app/generated/**',
      'prisma/migrations/**',
      'src/generated/**',
    ],
  }
);
