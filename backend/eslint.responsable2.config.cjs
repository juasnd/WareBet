const js = require('@eslint/js');

module.exports = [
  {
    files: [
      'src/app.js',
      'src/services/bettingService.js',
      'tests/eventos_deportivos.responsable2.test.js',
      'eslint.responsable2.config.cjs'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        process: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      semi: ['error', 'always'],
      quotes: ['error', 'single']
    }
  },
  {
    files: ['tests/eventos_deportivos.responsable2.test.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
