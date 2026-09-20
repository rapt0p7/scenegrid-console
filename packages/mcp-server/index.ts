// oxlint-disable no-underscore-dangle
/* eslint-disable @typescript-eslint/naming-convention */
import { MCPServer } from 'mcp-use';
import { z } from 'zod';

import { CommandDispatcher } from './src/CommandDispatcher.js';
import { validateConfigurations } from './src/validate_configurations.js';
import { WebSocketTelemetryServer } from './src/WebSocketTelemetryServer.js';

const server = new MCPServer({
    name: 'scenegrid-mcp-server',
    title: 'SceneGrid MCP Server',
    version: '1.0.0',
    description: 'SceneGrid diagnostic and orchestration tools',
    instructions: 'use show-app to open the app view',
    websiteUrl: 'https://mcp-use.com',
    icons: [
        {
            src: 'icon.svg',
            mimeType: 'image/svg+xml',
            sizes: ['512x512']
        }
    ]
});

const telemetryServer = new WebSocketTelemetryServer(8081);

const isBuilding = process.argv.some(arg => arg.includes('build'));

declare global {
    var __telemetryServer: WebSocketTelemetryServer | undefined;
}

if (!isBuilding) {
    const startServer = async () => {
        if (globalThis.__telemetryServer) {
            console.log('[TelemetryServer] HMR: Stopping previous server...');
            try {
                await globalThis.__telemetryServer.stop();
            } catch (err) {
                console.error('[TelemetryServer] Error stopping previous server:', err);
            }
        }

        globalThis.__telemetryServer = telemetryServer;

        try {
            await telemetryServer.start();
        } catch (err) {
            console.error('Failed to start telemetry server:', err);
        }
    };

    void startServer();

    const shutdown = async (signal?: string) => {
        console.log(`[TelemetryServer] Gracefully shutting down (signal: ${signal})...`);
        try {
            await telemetryServer.stop();
            globalThis.__telemetryServer = undefined;
            if (signal === 'SIGUSR2') {
                process.kill(process.pid, 'SIGUSR2');
            } else if (signal) {
                process.exit(0);
            }
        } catch (err) {
            console.error('[TelemetryServer] Error during shutdown:', err);
            if (signal) process.exit(1);
        }
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}

const dispatcher = new CommandDispatcher(telemetryServer);

// TOOLS

server.use('mcp:tools/call', async (ctx, next) => {
    const result = await next();
    console.log(`[mcp:tools/call] ${ctx.params?.name} result:`, JSON.stringify(result));
    return result;
});

import {
    getActivePlaybacksHandler,
    getBusStateHandler,
    getRtpcValuesHandler,
    getEngineLogsHandler,
    getRamReportHandler,
    getConsistencyReportHandler,
    getManifestHandler,
    triggerEventHandler,
    setRtpcValueHandler
} from './src/runtime_tools.js';

export const getActivePlaybacks = server.tool(
    {
        name: 'get_active_playbacks',
        title: 'Get Active Playbacks',
        description: 'Retrieves the currently active audio playbacks (voices) from the telemetry snapshot.',
        inputSchema: z.object({}),
        outputSchema: z.array(z.any()).describe('List of active playbacks'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getActivePlaybacksHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getBusState = server.tool(
    {
        name: 'get_bus_state',
        title: 'Get Bus State',
        description:
            'Retrieves the current state of audio buses (volumes, ducking, effects) from the telemetry snapshot.',
        inputSchema: z.object({}),
        outputSchema: z.array(z.any()).describe('List of bus states'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getBusStateHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getRtpcValues = server.tool(
    {
        name: 'get_rtpc_values',
        title: 'Get RTPC Values',
        description: 'Retrieves the current real-time parameter control (RTPC) values from the telemetry snapshot.',
        inputSchema: z.object({}),
        outputSchema: z.record(z.string(), z.number()).describe('Map of RTPC names to their current values'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getRtpcValuesHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getConsistencyReport = server.tool(
    {
        name: 'get_consistency_report',
        title: 'Get Consistency Report',
        description: "Retrieves the live validation and consistency report generated by the engine's telemetry worker.",
        inputSchema: z.object({}),
        outputSchema: z.object({}).passthrough().describe('Consistency report including errors and warnings'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getConsistencyReportHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getEngineManifest = server.tool(
    {
        name: 'get_engine_manifest',
        title: 'Get Engine Manifest',
        description:
            'Retrieves the full static engine configuration (Manifest) including banks, events, buses, and global settings.',
        inputSchema: z.object({}),
        outputSchema: z.object({}).passthrough().describe('Engine Manifest configuration data'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getManifestHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getEngineLogs = server.tool(
    {
        name: 'get_engine_logs',
        title: 'Get Engine Logs',
        description: 'Retrieves the recent stream of lifecycle events and cause chains from the telemetry snapshot.',
        inputSchema: z.object({}),
        outputSchema: z.array(z.any()).describe('Array of event logs'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getEngineLogsHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const getRamReport = server.tool(
    {
        name: 'get_ram_report',
        title: 'Get RAM Report',
        description: 'Retrieves the RAM report from the telemetry snapshot.',
        inputSchema: z.object({}),
        outputSchema: z.object({}).passthrough().describe('RAM report data'),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async () => {
        const data = await getRamReportHandler(telemetryServer);
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: data
        };
    }
);

export const triggerEvent = server.tool(
    {
        name: 'trigger_event',
        title: 'Trigger Event',
        description: 'Fires an event by eventId through the command dispatcher.',
        inputSchema: z.object({
            eventId: z.string().describe('The ID of the event to trigger')
        }),
        outputSchema: z.object({ success: z.boolean() }),
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ eventId }) => {
        await triggerEventHandler(dispatcher, eventId);
        return {
            content: [{ type: 'text', text: `Event ${eventId} triggered.` }],
            structuredContent: { success: true }
        };
    }
);

export const setRtpcValue = server.tool(
    {
        name: 'set_rtpc_value',
        title: 'Set RTPC Value',
        description: 'Sets the value of an RTPC parameter.',
        inputSchema: z.object({
            param: z.string().describe('The RTPC parameter name'),
            value: z.number().describe('The numerical value to set')
        }),
        outputSchema: z.object({ success: z.boolean() }),
        annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    async ({ param, value }) => {
        await setRtpcValueHandler(dispatcher, param, value);
        return {
            content: [{ type: 'text', text: `RTPC ${param} set to ${value}.` }],
            structuredContent: { success: true }
        };
    }
);

export const validateConfigurationsTool = server.tool(
    {
        name: 'validate_configurations',
        title: 'Validate Configurations',
        description: 'Validates a JSON configuration payload against the SceneGrid engine ConsistencyChecker.',
        inputSchema: z.object({
            payload: z.any().describe('The JSON configuration payload to validate')
        }),
        outputSchema: z.object({
            errors: z.array(z.string()),
            warnings: z.array(z.string())
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    },
    async ({ payload }) => {
        const report = await validateConfigurations(payload);
        return {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
            structuredContent: report
        };
    }
);

export default server;
