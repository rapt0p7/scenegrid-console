// @ts-check
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import eslintPluginBoundaries from 'eslint-plugin-boundaries';
import markdownlintPlugin from 'eslint-plugin-markdownlint';
import markdownlintParser from 'eslint-plugin-markdownlint/parser.js';
import json from '@eslint/json';
import vitest from '@vitest/eslint-plugin';
import oxlint from 'eslint-plugin-oxlint';
import * as jsoncParser from 'jsonc-eslint-parser';

export default tseslint.config(
    {
        ignores: ['node_modules/', '**/build/**', '**/dist/**', '**/*.js', 'coverage/']
    },
    {
        files: ['**/*.ts'],
        ignores: ['**/*.json', '**/*md'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                warnOnUnsupportedTypeScriptVersion: false
            }
        },
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            'import': importPlugin,
            'boundaries': eslintPluginBoundaries
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
                { type: 'application', mode: 'full', pattern: 'src/Application' },
                { type: 'domain', mode: 'full', pattern: 'src/Domain' },
                { type: 'kernel', mode: 'full', pattern: 'src/Kernel' },
                { type: 'debug', mode: 'full', pattern: 'src/Infrastructure/debug' },
                { type: 'infrastructure', mode: 'full', pattern: 'src/Infrastructure' },
                { type: 'shared', mode: 'full', pattern: 'src/Shared' },
                { type: 'helpers', mode: 'full', pattern: 'src/helpers' },
                { type: 'root', mode: 'full', pattern: 'src/*.ts' }
            ]
        },
        rules: {
            'import/no-restricted-paths': [
                'error',
                {
                    zones: [
                        {
                            target: './src/Domain/**/*.ts',
                            from: ['./src/Infrastructure/**/*.ts', './src/Application/**/*.ts'],
                            message: 'Domain layer must be pure. Infrastructure or Application details leaked.'
                        },
                        {
                            target: './src/Kernel/**/*.ts',
                            from: ['./src/Domain/**/*.ts', './src/Infrastructure/**/*.ts'],
                            message: 'Kernel should only contain low-level logic. Domain logic found.'
                        },
                        {
                            target: './src/Shared/**/*.ts',
                            from: ['./src/Domain/**/*.ts', './src/Kernel/**/*.ts', './src/Infrastructure/**/*.ts'],
                            message: 'Shared utilities must be independent of business logic.'
                        }
                    ]
                }
            ],

            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    rules: [
                        {
                            from: 'application',
                            allow: ['application', 'domain', 'kernel', 'infrastructure', 'shared', 'helpers', 'debug']
                        },
                        {
                            from: 'domain',
                            allow: ['domain', 'kernel', 'shared', 'helpers']
                        },
                        {
                            from: 'kernel',
                            allow: ['kernel', 'shared', 'helpers']
                        },
                        {
                            from: 'infrastructure',
                            allow: ['infrastructure', 'domain', 'kernel', 'shared', 'helpers', 'debug']
                        },
                        {
                            from: 'debug',
                            allow: ['debug', 'infrastructure', 'domain', 'kernel', 'shared', 'helpers']
                        },
                        { from: 'shared', allow: ['shared'] },
                        { from: 'helpers', allow: ['helpers', 'shared'] },
                        {
                            from: 'root',
                            allow: [
                                'application',
                                'domain',
                                'kernel',
                                'infrastructure',
                                'shared',
                                'helpers',
                                'debug',
                                'root'
                            ]
                        }
                    ]
                }
            ],
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@infrastructure/*', 'src/Infrastructure/*'],
                            message: 'Deep imports from Infrastructure are forbidden. Use the public API facade.'
                        }
                    ]
                }
            ],

            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'property',
                    modifiers: ['readonly'],
                    format: ['UPPER_CASE'],
                    filter: {
                        regex: '^[A-Z0-9_]+$',
                        match: true
                    }
                },
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
        plugins: {
            vitest
        },
        rules: {
            ...vitest.configs.recommended.rules,
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-type-assertion': 'off',
            '@typescript-eslint/unbound-method': 'off'
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
    oxlint.configs['flat/recommended']
);
