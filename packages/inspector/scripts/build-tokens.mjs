import { register } from '@tokens-studio/sd-transforms';
import StyleDictionary from 'style-dictionary';

await register(StyleDictionary);

StyleDictionary.registerTransform({
    name: 'scenegrid/number-px',
    type: 'value',
    filter: (token) => {
        const type = token.$type ?? token.type;
        if (type !== 'number') return false;
        const path = token.path.join('.');
        return !path.includes('font-weight') && !path.includes('weight');
    },
    transform: (token) => {
        const val = token.$value ?? token.value;
        return typeof val === 'number' ? `${val}px` : val;
    },
});

const tokensStudioTransforms = [
    ...StyleDictionary.hooks.transformGroups['tokens-studio'].filter(
        (t) => t !== 'name/camel',
    ),
    'scenegrid/number-px',
    'name/kebab',
];

const sdLight = new StyleDictionary({
    source: [
        'tokens/SceneGrid/Radix Primitives/Value.json',
        'tokens/SceneGrid/Semantic Colors (Light)/Light (Paper).json',
        'tokens/SceneGrid/Typography/Medeo (DNFDEVS).json',
        'tokens/SceneGrid/Geometry/Default.json',
    ],
    preprocessors: ['tokens-studio'],
    platforms: {
        css: {
            transforms: tokensStudioTransforms,
            buildPath: 'src/styles/',
            files: [
                {
                    destination: 'variables.css',
                    format: 'css/variables',
                    options: {
                        outputReferences: true,
                    },
                },
            ],
        },
    },
});

const sdDark = new StyleDictionary({
    source: [
        'tokens/SceneGrid/Radix Primitives/Value.json',
        'tokens/SceneGrid/Semantic Colors/Dark (Slate).json',
    ],
    preprocessors: ['tokens-studio'],
    platforms: {
        css: {
            transforms: tokensStudioTransforms,
            buildPath: 'src/styles/',
            files: [
                {
                    destination: 'variables-dark.css',
                    format: 'css/variables',
                    filter: (token) => token.path[0] === 'color',
                    options: {
                        selector: '.dark',
                        outputReferences: true,
                    },
                },
            ],
        },
    },
});

await sdLight.cleanAllPlatforms();
await sdLight.buildAllPlatforms();
await sdDark.buildAllPlatforms();
