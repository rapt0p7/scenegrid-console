// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-plugin-prettier';
import eslintPluginBoundaries from 'eslint-plugin-boundaries';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import prettierConfig from 'eslint-config-prettier';
import markdownlintPlugin from 'eslint-plugin-markdownlint';
import markdownlintParser from 'eslint-plugin-markdownlint/parser.js';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import deMorgan from 'eslint-plugin-de-morgan';
import noSecrets from 'eslint-plugin-no-secrets';
import pluginSecurity from 'eslint-plugin-security';
import json from '@eslint/json';
import * as jsoncParser from 'jsonc-eslint-parser';

export default tseslint.config(
    {
        ignores: ['node_modules/', '**/build/**', '**/dist/**', '**/*.js', 'coverage/']
    },

    js.configs.recommended,
    tseslint.configs.recommended,
    eslintPluginUnicorn.configs.recommended,
    deMorgan.configs.recommended,
    pluginSecurity.configs.recommended,

    {
        files: ['**/*.ts'],
        ignores: ['**/*.json', '**/*md'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.jest
            }
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            'no-secrets': noSecrets,
            'prettier': prettier,
            'import': importPlugin,
            'boundaries': eslintPluginBoundaries,
            'sonarjs': sonarjs
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: './tsconfig.json'
                },
                node: {
                    extensions: ['.js', '.ts']
                }
            },
            'boundaries/elements': [
                { type: 'webaudio-core', pattern: 'src/webaudio-core' },
                { type: 'interfaces', pattern: 'src/interfaces' },
                { type: 'config', pattern: 'src/config' },
                { type: 'bus-system', pattern: 'src/BusSystem' },
                { type: 'app-core', pattern: 'src/Core' },
                { type: 'managers', pattern: 'src/Managers' },
                { type: 'app-root', pattern: 'src/*.*' },
                { type: 'helpers', pattern: 'src/helpers' },
                { type: 'debug', pattern: 'src/Debug' }
            ],
            'boundaries/alias': {
                '@webaudio-core/(.*)': 'src/webaudio-core/$1'
            }
        },
        rules: {
            'prettier/prettier': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-param-reassign': ['error', { props: true, ignorePropertyModificationsFor: ['draft'] }],
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            'no-else-return': ['error', { allowElseIf: false }],
            'no-useless-constructor': 'error',
            'class-methods-use-this': 'warn',
            'complexity': ['error', { max: 15 }],
            'max-params': ['error', { max: 3 }],

            'no-secrets/no-secrets': 'error',

            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': ['warn', { allowExpressions: true }],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
            '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/member-ordering': [
                'error',
                {
                    default: [
                        'public-static-field',
                        'protected-static-field',
                        'private-static-field',
                        'public-static-method',
                        'protected-static-method',
                        'private-static-method',
                        'public-abstract-field',
                        'protected-abstract-field',
                        'public-instance-field',
                        'protected-instance-field',
                        'private-instance-field',
                        'public-constructor',
                        'protected-constructor',
                        'private-constructor',
                        'public-abstract-method',
                        'protected-abstract-method',
                        'public-instance-method',
                        'protected-instance-method',
                        'private-instance-method'
                    ]
                }
            ],

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'variable',
                    modifiers: ['const'],
                    format: ['camelCase', 'PascalCase']
                },
                {
                    selector: 'default',
                    format: ['camelCase', 'PascalCase']
                },
                {
                    selector: 'default',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow',
                    trailingUnderscore: 'forbid'
                },
                {
                    selector: ['class', 'interface', 'typeAlias', 'enum'],
                    format: ['PascalCase']
                },
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^I[A-Z]',
                        match: true
                    }
                },
                {
                    selector: ['function'],
                    format: ['camelCase', 'PascalCase'],
                    filter: {
                        regex: '^[A-Z].*$',
                        match: false
                    }
                },
                {
                    selector: 'variable',
                    modifiers: ['const', 'global'],
                    format: ['UPPER_CASE']
                },
                {
                    selector: 'variable',
                    modifiers: ['const', 'destructured'],
                    format: ['camelCase', 'PascalCase'],
                    filter: {
                        regex: '^[A-Z_]*$',
                        match: false
                    }
                },
                {
                    selector: 'variable',
                    types: ['function'],
                    format: ['camelCase', 'PascalCase']
                },
                {
                    selector: 'typeAlias',
                    format: ['PascalCase'],
                    custom: {
                        regex: '(Type|Schema|Id|Name)$',
                        match: true
                    }
                },
                {
                    selector: 'variable',
                    format: ['PascalCase'],
                    filter: {
                        regex: '(ComponentId|EventName|StepId|ScenarioId)$',
                        match: true
                    }
                },
                {
                    selector: 'variable',
                    format: ['PascalCase'],
                    filter: {
                        regex: '(Schema)$',
                        match: true
                    }
                },
                {
                    selector: 'parameter',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow'
                },
                {
                    selector: 'typeParameter',
                    format: ['PascalCase'],
                    custom: {
                        regex: '^[TEURK]$',
                        match: true
                    }
                }
            ],

            'import/no-cycle': ['error', { maxDepth: Infinity }],
            'import/no-restricted-paths': [
                'error',
                {
                    zones: [
                        {
                            target: './src/BusSystem/**/*.ts',
                            from: ['./src/Managers/**/*.ts', './src/config/**/*.ts']
                        },
                        {
                            target: './src/Core/**/*.ts',
                            from: ['./src/Managers/**/*.ts', './src/config/**/*.ts']
                        }
                    ]
                }
            ],
            'import/order': [
                'error',
                {
                    'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
                    'pathGroups': [{ pattern: '@webaudio-core/**', group: 'internal' }],
                    'newlines-between': 'always',
                    'alphabetize': { order: 'asc', caseInsensitive: true }
                }
            ],
            'import/no-unused-modules': 'off',

            'boundaries/element-types': [
                'error',
                {
                    default: 'disallow',
                    rules: [
                        { from: ['webaudio-core'], allow: ['webaudio-core'] },
                        { from: ['interfaces'], allow: ['interfaces', 'webaudio-core'] },
                        { from: ['config'], allow: ['config', 'interfaces', 'webaudio-core'] },
                        { from: ['bus-system'], allow: ['bus-system', 'interfaces', 'webaudio-core', 'helpers'] },
                        { from: ['app-core'], allow: ['app-core', 'interfaces', 'webaudio-core', 'helpers', 'debug'] },
                        {
                            from: ['managers'],
                            allow: [
                                'managers',
                                'bus-system',
                                'app-core',
                                'config',
                                'interfaces',
                                'webaudio-core',
                                'helpers'
                            ]
                        },
                        {
                            from: ['helpers'],
                            allow: ['helpers']
                        },
                        {
                            from: ['debug'],
                            allow: ['debug', 'webaudio-core', 'interfaces', 'helpers']
                        },
                        {
                            from: ['app-root'],
                            allow: [
                                'webaudio-core',
                                'interfaces',
                                'config',
                                'bus-system',
                                'app-core',
                                'managers',
                                'app-root',
                                'helpers'
                            ]
                        }
                    ]
                }
            ],

            'sonarjs/cognitive-complexity': ['warn', 15],
            'sonarjs/no-duplicate-string': 'warn',
            'sonarjs/no-identical-functions': 'error',
            'sonarjs/no-duplicated-branches': 'error',
            'sonarjs/no-all-duplicated-branches': 'error',
            'sonarjs/no-ignored-return': 'error',
            'sonarjs/prefer-immediate-return': 'warn',
            'sonarjs/no-collapsible-if': 'warn',
            'sonarjs/no-nested-template-literals': 'warn',
            'sonarjs/no-collection-size-mischeck': 'error',
            'sonarjs/no-empty-collection': 'error',
            'sonarjs/no-redundant-jump': 'error',

            'unicorn/filename-case': 'off',
            'unicorn/no-null': 'off'
        }
    },
    {
        files: ['**/*.ts'],
        ignores: ['src/webaudio-core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@webaudio-core/*'],
                            message:
                                'Deep imports from core are forbidden outside of the core domain. Import directly from the public API: "@webaudio-core".'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: [
            '**/__tests__/**/*.{js,ts,jsx,tsx}',
            '**/tests/**/*.{js,ts,jsx,tsx}',
            '**/*.test.{js,ts,jsx,tsx}',
            '**/*.spec.{js,ts,jsx,tsx}'
        ],
        rules: {
            'unicorn/no-useless-undefined': 'off',
            '@typescript-eslint/naming-convention': 'off'
        }
    },
    {
        files: ['**/*md'],
        plugins: {
            markdownlint: markdownlintPlugin
        },
        languageOptions: {
            parser: markdownlintParser
        },
        rules: {
            ...markdownlintPlugin.configs.recommended.rules
        }
    },
    {
        files: ['**/*.json'],
        languageOptions: {
            parser: jsoncParser
        },
        ignores: ['package-lock.json'],
        plugins: { json },
        rules: {
            ...json.configs.recommended.rules
        }
    },
    prettierConfig,
    eslintPluginPrettierRecommended
);
