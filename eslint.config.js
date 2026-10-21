'use strict';
const globals = require('globals');
const security = require('eslint-plugin-security');

// Reglas de codificación segura revisadas en cada integración (GitHub Actions)
module.exports = [
  security.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': ['warn', { allow: ['error', 'log'] }],
      eqeqeq: 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
    },
  },
];
