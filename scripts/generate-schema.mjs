import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const tsj = require('ts-json-schema-generator');
const ts = require('typescript');
const $RefParser = require('@apidevtools/json-schema-ref-parser');

const rootDir = process.cwd();
const inputPath = path.resolve(rootDir, 'packages/engine/src/Application/Ports/IAudioEngineConfig.ts');
const tsconfigPath = path.resolve(rootDir, 'packages/engine/tsconfig.json');
const outputDir = path.resolve(rootDir, 'packages/mcp-server/generated');
const outputFile = path.resolve(outputDir, 'schema.json');
const dereferencedOutputFile = path.resolve(outputDir, 'schema.dereferenced.json');

const config = {
    path: inputPath,
    tsconfig: tsconfigPath,
    type: 'IAudioEngineConfig',
    skipTypeCheck: true,
    expose: 'export',
    topRef: true,
    jsDoc: 'extended'
};

const program = tsj.createProgram(config);

function augmentor(chainNodeParser) {
    chainNodeParser.addNodeParser({
        supportsNode(node) {
            return (
                ts.isTypeReferenceNode(node) &&
                (node.typeName.getText() === 'DeepReadonly' || node.typeName.getText().endsWith('.DeepReadonly'))
            );
        },
        createType(node, context) {
            if (node.typeArguments && node.typeArguments.length > 0) {
                return chainNodeParser.createType(node.typeArguments[0], context);
            }
            return new tsj.AnyType();
        }
    });
}

const parser = tsj.createParser(program, config, augmentor);
const formatter = tsj.createFormatter(config);
const generator = new tsj.SchemaGenerator(program, parser, formatter, config);

console.log(`Generating JSON Schema for ${config.type} from ${inputPath}...`);
const schema = generator.createSchema(config.type);

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const jsonContent = JSON.stringify(schema, null, 2);
fs.writeFileSync(outputFile, jsonContent, 'utf-8');

console.log(`Dereferencing schema using @apidevtools/json-schema-ref-parser...`);
const dereferencedSchema = await $RefParser.dereference(JSON.parse(jsonContent));
const dereferencedJsonContent = JSON.stringify(dereferencedSchema, null, 2);
fs.writeFileSync(dereferencedOutputFile, dereferencedJsonContent, 'utf-8');

console.log(`Successfully generated schemas:`);
console.log(` - ${outputFile} (${Object.keys(schema.definitions || {}).length} definitions)`);
console.log(` - ${dereferencedOutputFile} (fully dereferenced)`);
