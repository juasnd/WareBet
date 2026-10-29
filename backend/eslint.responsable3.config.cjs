const js = require('@eslint/js');

module.exports = [
  {
    files: [
      'src/app.js',
      'src/services/bettingService.js',
      'src/repositories/crudRepository.js',
      'src/middlewares/auth.js',
      'src/middlewares/errors.js',
      'src/utils/sql.js',
      'tests/apuestas.responsable3.test.js',
      'eslint.responsable3.config.cjs'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        process: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['tests/apuestas.responsable3.test.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly'
      }
    }
  }
];
