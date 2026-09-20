// oxlint-disable max-lines-per-function
// noinspection D

import { WebSocketServer, WebSocket } from 'ws';

export interface TelemetrySnapshot {
    activePlaybacks?: any[];
    buses?: any[];
    rtpcs?: any[];
    logs?: any[];
    ramReport?: any;
    consistencyReport?: any;
    manifest?: any;
}

export type IncomingPayload =
    | {
          type: 'SNAPSHOT';
          playbacks?: any[];
          buses?: any[];
          rtpcValues?: Record<string, number>;
          causeChains?: any[];
          ramReport?: any;
      }
    | {
          type: 'FULL_SYNC';
          playbacks?: any[];
          buses?: any[];
          rtpcValues?: Record<string, number>;
          causeChains?: any[];
          ramReport?: any;
      };

export class WebSocketTelemetryServer {
    private wss: WebSocketServer | null = null;
    private port: number;
    private state: TelemetrySnapshot = {};
    private clients: Set<WebSocket> = new Set();

    constructor(port: number = 8081) {
        this.port = port;
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wss = new WebSocketServer({ port: this.port });

            this.wss.on('listening', () => {
                console.log(`[TelemetryServer] Listening on port ${this.port}`);
                resolve();
            });

            this.wss.on('error', err => {
                console.error(`[TelemetryServer] Server error:`, err);
                reject(err);
            });

            this.wss.on('connection', ws => {
                this.handleConnection(ws);
            });
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.wss) {
                resolve();
                return;
            }

            for (const client of this.clients) {
                client.close();
            }
            this.clients.clear();

            this.wss.close(err => {
                if (err) {
                    console.error('[TelemetryServer] Error stopping server:', err);
                    reject(err);
                } else {
                    console.log('[TelemetryServer] Server stopped');
                    this.wss = null;
                    resolve();
                }
            });
        });
    }

    public broadcast(message: string): void {
        if (this.clients.size > 0) {
            console.log(`[TelemetryServer] Broadcasting message to ${this.clients.size} clients`);
        }
        for (const client of this.clients) {
            client.send(message);
        }
    }

    public getSnapshot(): TelemetrySnapshot {
        return this.state;
    }

    private handleConnection(ws: WebSocket): void {
        console.log('[TelemetryServer] Client connected');
        this.clients.add(ws);

        ws.on('message', message => {
            try {
                // oxlint-disable-next-line typescript/no-unsafe-assignment typescript/no-base-to-string
                const parsed = JSON.parse(message.toString());
                let packets: any[] = [];

                if (parsed.type === 'MANIFEST') {
                    this.state.manifest = parsed.payload;
                } else if (parsed.type === 'FULL_SYNC' && parsed.payload && Array.isArray(parsed.payload.packets)) {
                    console.log('[TelemetryServer] Received FULL_SYNC payload');
                    packets = parsed.payload.packets;
                    // Reset logs on full sync to avoid duplicates
                    this.state.logs = [];
                } else if (parsed.batchId !== undefined && Array.isArray(parsed.packets)) {
                    packets = parsed.packets;
                }

                for (const packet of packets) {
                    if (!packet) continue;
                    if (packet.type === 'MANIFEST') {
                        this.state.manifest = packet.payload;
                    } else if (packet.type === 'SNAPSHOT') {
                        if (packet.activePlaybacks) this.state.activePlaybacks = packet.activePlaybacks;
                        if (packet.buses) this.state.buses = packet.buses;
                        if (packet.rtpcs) this.state.rtpcs = packet.rtpcs;
                    } else if (packet.type === 'CAUSE_CHAIN' || packet.type === 'LIFECYCLE') {
                        if (!this.state.logs) this.state.logs = [];
                        this.state.logs.push(packet);
                        // keep only the last 200 to match inspector
                        if (this.state.logs.length > 200) this.state.logs.shift();
                    } else if (packet.type === 'RAM_REPORT') {
                        this.state.ramReport = packet.report || packet;
                    } else if (packet.type === 'CONSISTENCY_REPORT') {
                        this.state.consistencyReport = packet;
                    }
                }
            } catch (e) {
                console.warn('[TelemetryServer] Failed to parse message', e);
            }
        });

        ws.on('error', err => {
            console.error('[TelemetryServer] Client error:', err);
        });

        ws.on('close', () => {
            console.log('[TelemetryServer] Client disconnected');
            this.clients.delete(ws);
        });
    }
}
