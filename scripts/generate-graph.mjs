// oxlint-disable max-lines-per-function
// noinspection D

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const execAsync = promisify(exec);

const MMD_OUTPUT_PATH = 'docs/dependency-graph.mmd';
const SVG_OUTPUT_PATH = 'docs/diagram.svg';
const MERMAID_CONFIG_PATH = 'docs/config.json';

const DEPCRUISE_CMD = `npx depcruise packages/engine/src packages/shared/src --config .dependency-cruiser.cjs --include-only "^packages/(engine|shared)/src" --exclude "(__benchmarks__|__tests__|\\.test\\.ts$|\\.spec\\.ts$|\\.bench\\.ts$|\\.d\\.ts$)" --output-type mermaid`;
const MERMAID_CLI_CMD = `npx mmdc -i ${MMD_OUTPUT_PATH} -o ${SVG_OUTPUT_PATH} -c ${MERMAID_CONFIG_PATH}`;

const CLASS_DEFINITIONS = `
%% --- Class Definitions ---
classDef domain fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;
classDef infrastructure fill:#f0fdf4,stroke:#22c55e,stroke-width:2px,color:#14532d;
classDef ports fill:#fdf4ff,stroke:#d946ef,stroke-width:2px,color:#701a75,stroke-dasharray: 5 5;
classDef shared fill:#fff7ed,stroke:#f97316,stroke-width:2px,color:#7c2d12;
classDef kernel fill:#fef2f2,stroke:#ef4444,stroke-width:2px,color:#7f1d1d;
classDef events fill:#f5f3ff,stroke:#8b5cf6,stroke-width:2px,color:#4c1d95;
classDef defaultNode fill:#ffffff,stroke:#94a3b8,stroke-width:2px,color:#0f172a;
`;

const MERMAID_CONFIG = {
    maxTextSize: 100000000,
    maxEdges: 100000,
    theme: 'base',
    themeVariables: {
        fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
        fontSize: '13px',
        lineColor: '#94a3b8',
        edgeLabelBackground: '#ffffff',
        clusterBkg: '#f8fafc',
        clusterBorder: '#94a3b8',
        primaryColor: '#ffffff',
        primaryTextColor: '#0f172a',
        primaryBorderColor: '#64748b',
        tertiaryColor: '#f1f5f9'
    },
    flowchart: {
        defaultRenderer: 'elk',
        curve: 'basis',
        htmlLabels: false,
        nodeSpacing: 80,
        rankSpacing: 180,
        diagramPadding: 50,
        useMaxWidth: false
    },
    elk: {
        mergeEdges: false
    }
};

async function ensureDir(filePath) {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
}

function processMermaidGraph(rawMmd) {
    const lines = rawMmd.split('\n');
    const processedLines = [];
    const classAssignments = new Set();
    const subgraphStack = [];

    const subgraphRegex = /^\s*subgraph\s+[A-Za-z0-9_]+\["(.*?)"\]/;
    const nodeRegex = /^\s*([A-Za-z0-9_]+)\["(.*?)"\]/;
    const endRegex = /^\s*end\s*$/;

    for (const line of lines) {
        processedLines.push(line);

        const subgraphMatch = line.match(subgraphRegex);
        if (subgraphMatch) {
            subgraphStack.push(subgraphMatch[1]);
            continue;
        }

        if (endRegex.test(line) && subgraphStack.length > 0) {
            subgraphStack.pop();
            continue;
        }

        const nodeMatch = line.match(nodeRegex);
        if (nodeMatch && !line.includes('-->')) {
            const nodeId = nodeMatch[1];
            const nodeName = nodeMatch[2];

            let assignedClass = 'defaultNode';
            const context = subgraphStack.join(' > ').toLowerCase();

            if (
                (nodeName.startsWith('I') && nodeName.charAt(1) === nodeName.charAt(1).toUpperCase()) ||
                context.includes('ports')
            ) {
                assignedClass = 'ports';
            } else if (context.includes('infrastructure')) {
                assignedClass = 'infrastructure';
            } else if (context.includes('kernel')) {
                assignedClass = 'kernel';
            } else if (context.includes('shared')) {
                assignedClass = 'shared';
            } else if (context.includes('events')) {
                assignedClass = 'events';
            } else if (context.includes('domain')) {
                assignedClass = 'domain';
            }

            classAssignments.add(`class ${nodeId} ${assignedClass};`);
        }
    }

    processedLines.push('\n' + CLASS_DEFINITIONS);
    processedLines.push('%% --- Class Assignments ---');
    processedLines.push(...Array.from(classAssignments));

    return processedLines.join('\n');
}

async function run() {
    try {
        console.log('🚀 [1/4] Running dependency-cruiser...');
        const { stdout: rawMermaid, stderr: dcStderr } = await execAsync(DEPCRUISE_CMD, {
            maxBuffer: 1024 * 1024 * 50
        });
        if (dcStderr) console.warn('Предупреждение depcruise:', dcStderr);

        console.log('🎨 [2/4] Parsing and stylizing...');
        const styledMermaid = processMermaidGraph(rawMermaid);

        console.log('💾 [3/4] Saving .mmd and config.json...');
        await ensureDir(MMD_OUTPUT_PATH);
        await writeFile(MMD_OUTPUT_PATH, styledMermaid, 'utf-8');
        await writeFile(MERMAID_CONFIG_PATH, JSON.stringify(MERMAID_CONFIG, null, 4), 'utf-8');

        console.log('🖼️  [4/4] Generating SVG using mermaid-cli...');
        const { stderr: mmdcStderr } = await execAsync(MERMAID_CLI_CMD);
        if (mmdcStderr) console.warn('Предупреждение mmdc:', mmdcStderr);

        console.log(`✅ Done! Graph saved in: ${SVG_OUTPUT_PATH}`);
    } catch (error) {
        console.error('❌ Error during graph generation:', error);
        process.exit(1);
    }
}

// oxlint-disable-next-line unicorn/prefer-top-level-await
void run();

