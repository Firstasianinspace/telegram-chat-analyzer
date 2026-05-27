// eslint.config.ts

import pluginEslintComments from '@eslint-community/eslint-plugin-eslint-comments'
import pluginVueI18n from '@intlify/eslint-plugin-vue-i18n'
import pluginVitest from '@vitest/eslint-plugin'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginImportX from 'eslint-plugin-import-x'
import pluginOxlint from 'eslint-plugin-oxlint'
import { configs as pnpmConfigs } from 'eslint-plugin-pnpm'
import pluginUnicorn from 'eslint-plugin-unicorn'
import pluginVue from 'eslint-plugin-vue'
import localRules from './eslint-local-rules.ts'

export default defineConfigWithVueTs(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  pluginUnicorn.configs.recommended,

  // Unicorn overrides for Vue conventions
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // Vue uses PascalCase for components; camelCase is standard for TS files
      'unicorn/filename-case': ['error', {
        cases: { kebabCase: true, pascalCase: true, camelCase: true },
      }],
      // Allow common abbreviations used across the Vue ecosystem
      'unicorn/prevent-abbreviations': ['error', {
        replacements: {
          props: false,
          ref: false,
          refs: false,
          e: false,
          env: false,
          db: false,
          fn: false,
          fns: false,
          args: false,
          params: false,
          msg: false,
        },
      }],
    },
  },

  // Vue component rules
  {
    files: ['src/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': ['error', { ignores: ['App', 'Layout'] }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/no-unused-properties': ['error', { groups: ['props', 'data', 'computed', 'methods'] }],
      'vue/no-unused-refs': 'error',
      'vue/define-props-destructuring': 'error',
      'vue/prefer-use-template-ref': 'error',
      'vue/max-template-depth': ['error', { maxDepth: 8 }],
    },
  },

  // TypeScript architecture style
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      complexity: ['warn', { max: 10 }],
      'no-nested-ternary': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'TSEnumDeclaration', message: 'Use literal unions instead of enums.' },
        { selector: 'IfStatement > :not(IfStatement).alternate', message: 'Avoid else. Use early returns.' },
      ],
    },
  },

  // Layer boundaries (adapted to chatAnalyzer)
  {
    files: ['src/**/*.{ts,vue}'],
    plugins: { 'import-x': pluginImportX },
    rules: {
      'import-x/no-restricted-paths': ['error', {
        zones: [
          // pages can import modules but not vice versa
          { target: './src/modules', from: './src/pages' },

          // modules cannot import pages
          { target: './src/pages', from: './src/modules' },

          // core cannot depend on modules or pages
          { target: './src/modules', from: './src/core' },
          { target: './src/pages', from: './src/core' },

          // shared should not depend on higher layers
          { target: './src/{app,pages,modules,core}', from: './src/shared' },
        ],
      }],
    },
  },

  // i18n enforcement
  {
    files: ['src/**/*.vue'],
    plugins: { '@intlify/vue-i18n': pluginVueI18n },
    rules: {
      '@intlify/vue-i18n/no-raw-text': 'error',
    },
  },

  // Prevent disabling i18n
  {
    files: ['src/**/*.vue'],
    plugins: { '@eslint-community/eslint-comments': pluginEslintComments },
    rules: {
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', '@intlify/vue-i18n/*'],
    },
  },

  // Vitest
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/**/*.{ts,vue}'],
    rules: {
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/max-nested-describe': ['error', { max: 2 }],
    },
  },

  // Local rules
  {
    files: ['src/**/*.{ts,vue}'],
    plugins: { local: localRules },
    rules: {
      'local/extract-condition-variable': 'error',
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
  ...pnpmConfigs.recommended,
  skipFormatting,
)