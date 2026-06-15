// import jestPlugin from 'eslint-plugin-jest';
import globals from 'globals';
import prettierPlugin from 'eslint-plugin-prettier'; // Import the Prettier plugin
// import eslintComments from 'eslint-plugin-eslint-comments';
import js from '@eslint/js';

export default [
    js.configs.recommended, // Nice defaults rules
    {
        files: ['**/*.js', '**/*.mjs'], // Apply to .js and .mjs files
        ignores: [
            'node_modules/**',
            'dist/**',
            'build/**',
            'coverage/**',
            '.vscode-server/**',
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            // sourceType: "commonjs",
            globals: {
                ...globals.node,
                // ...jestPlugin.environments.globals.globals,
                // ...globals.browser,
            },
        },
        plugins: {
            prettier: prettierPlugin, // Add Prettier plugin correctly
            // jest: jestPlugin, // Jest plugin
            // "eslint-comments": eslintComments, // Add plugin to detect cheats
        },
        rules: {
            'prettier/prettier': 'error',

            // Qualité
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-shadow': [
                'error',
                {
                    allow: ['err', 'resolve', 'reject'],
                },
            ],
            'no-empty-function': 'error',
            'no-lonely-if': 'error',
            'no-console': 'off',
            'no-undef': 'error',

            // Style
            curly: ['error', 'all'],
            semi: ['error', 'always'],
            quotes: ['error', 'single'],
            indent: ['error', 4],
            'comma-dangle': ['error', 'always-multiline'],
            'object-curly-spacing': ['error', 'always'],
            'space-before-blocks': 'error',
            'space-infix-ops': 'error',
            'keyword-spacing': 'error',
            'brace-style': ['error', '1tbs', { allowSingleLine: true }],
            'max-statements-per-line': ['error', { max: 1 }],
        },
    },
];
