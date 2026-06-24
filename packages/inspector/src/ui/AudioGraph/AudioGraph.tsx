// oxlint-disable max-lines-per-function
// noinspection D

import React, { useEffect, useRef, useCallback } from 'react';
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    Node,
    Edge,
    MarkerType,
    ReactFlowProvider
} from '@xyflow/react';
// oxlint-disable-next-line import/no-unassigned-import
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ITelemetrySnapshot } from '@scene-grid/shared';
import type { IEngineManifestDTO } from '../../types/ManifestDTO.js';
import { AudioNodeComponent } from './AudioNodeComponent.jsx';

const nodeTypes = { audio: AudioNodeComponent };

interface Props {
    manifest: IEngineManifestDTO;
    snapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>;
}

const elk = new ELK();

const getLayoutedElements = async (nodes: Node[], edges: Edge[]) => {
    const graph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.layered.spacing.nodeNodeBetweenLayers': '250',
            'elk.spacing.nodeNode': '40',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'
        },
        children: nodes.map(node => ({
            id: node.id,
            width: 220,
            height: node.data.type === 'voice' ? 90 : 150
        })),
        edges: edges
            .filter(edge => !(edge.source.startsWith('bus:') && edge.target.startsWith('bus:')))
            .map(edge => ({
                id: edge.id,
                sources: [edge.source],
                targets: [edge.target]
            }))
    };

    const layoutedGraph = await elk.layout(graph);

    const layoutedNodes = nodes.map(node => {
        const layoutedNode = layoutedGraph.children?.find(n => n.id === node.id);
        return {
            ...node,
            position: {
                x: layoutedNode?.x || 0,
                y: layoutedNode?.y || 0
            }
        };
    });

    return { nodes: layoutedNodes, edges };
};

interface Props {
    manifest: IEngineManifestDTO;
    snapshotRef: React.MutableRefObject<ITelemetrySnapshot | null>;
}

const AudioGraphInner: React.FC<Props> = ({ manifest, snapshotRef }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    // oxlint-disable-next-line typescript/no-unnecessary-type-arguments
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { fitView } = useReactFlow();

    const nodeUpdaters = useRef<Map<string, any>>(new Map());
    const registerNode = useCallback((id: string, updaters: any) => nodeUpdaters.current.set(id, updaters), []);
    const unregisterNode = useCallback((id: string) => nodeUpdaters.current.delete(id), []);

    const activeVoiceIds = useRef<Set<string>>(new Set());
    const isLayouting = useRef(false);

    const lastDuckingSource = useRef<Map<string, string>>(new Map());
    const activeScEdges = useRef<Set<string>>(new Set());

    const baseNodes = useRef<Node[]>([]);
    const baseEdges = useRef<Edge[]>([]);

    useEffect(() => {
        const initNodes: Node[] = [];
        const initEdges: Edge[] = [];

        initNodes.push({
            id: 'master',
            type: 'audio',
            position: { x: 0, y: 0 },
            data: { title: 'MASTER OUTPUT', type: 'master', registerNode, unregisterNode }
        });

        Object.entries(manifest.buses).forEach(([busId]) => {
            initNodes.push({
                id: `bus:${busId}`,
                type: 'audio',
                position: { x: 0, y: 0 },
                data: { title: `BUS: ${busId}`, type: 'bus', registerNode, unregisterNode }
            });
            initEdges.push({
                id: `e-bus:${busId}-master`,
                source: `bus:${busId}`,
                target: 'master',
                type: 'smoothstep'
            });
        });

        Object.entries(manifest.buses).forEach(([busId, config]) => {
            if (config.sends) {
                Object.keys(config.sends).forEach(targetId => {
                    initEdges.push({
                        id: `e-send-${busId}-${targetId}`,
                        source: `bus:${busId}`,
                        target: `bus:${targetId}`,
                        type: 'default',
                        animated: true,
                        style: { stroke: '#4f46e5', strokeWidth: 1.5 }
                    });
                });
            }
        });

        const checkedSidechains = new Set<string>();
        Object.values(manifest.soundMap).forEach(soundConfig => {
            const sourceBusId = soundConfig.busId || 'master';
            if (soundConfig.ducking?.target) {
                soundConfig.ducking.target.forEach(targetBusId => {
                    const edgeId = `e-sc-${sourceBusId}-${targetBusId}`;
                    if (!checkedSidechains.has(edgeId)) {
                        checkedSidechains.add(edgeId);
                        initEdges.push({
                            id: edgeId,
                            source: `bus:${sourceBusId}`,
                            target: `bus:${targetBusId}`,
                            type: 'default',
                            animated: false,
                            className: `sc-edge-target-${targetBusId} sc-edge-id-${edgeId}`,
                            style: { stroke: '#27272a', strokeWidth: 1.5, strokeDasharray: '4 4' },
                            markerEnd: { type: MarkerType.ArrowClosed, color: '#27272a' },
                            label: 'SC',
                            labelStyle: { fill: '#71717a', fontWeight: 500, fontSize: 10, fontFamily: 'monospace' },
                            labelBgStyle: { fill: '#09090b', fillOpacity: 0.8 },
                            labelBgPadding: [4, 2],
                            labelBgBorderRadius: 4
                        });
                    }
                });
            }
        });

        baseNodes.current = initNodes;
        baseEdges.current = initEdges;

        void getLayoutedElements(initNodes, initEdges).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            setTimeout(() => fitView({ padding: 0.2, duration: 800 }), 50);
        });
    }, [manifest, setNodes, setEdges, registerNode, unregisterNode, fitView]);

    useEffect(() => {
        let frameId: number;

        const syncLoop = () => {
            const snap = snapshotRef.current;
            if (!snap) return;

            snap.activePlaybacks?.forEach(p => {
                const soundConfig = manifest.soundMap[p.soundId];
                if (soundConfig?.ducking?.target) {
                    const sourceBusId = soundConfig.busId || 'master';
                    soundConfig.ducking.target.forEach(targetBusId => {
                        lastDuckingSource.current.set(targetBusId, sourceBusId);
                    });
                }
            });

            snap.buses?.forEach(b => {
                const updaters = nodeUpdaters.current.get(`bus:${b.busId}`);
                if (updaters) {
                    const scGain = b.sidechainGain ?? 1.0;
                    const trueFinal = b.finalGain * scGain;
                    const isVeto = trueFinal === 0 && b.logicalGain > 0;

                    updaters.updateText(
                        `Final: ${trueFinal.toFixed(2)}\nBase:  ${b.logicalGain.toFixed(2)}\nRTPC:  ${b.rtpcGain.toFixed(2)}\nDuck:  ${scGain.toFixed(2)}`
                    );
                    updaters.updateColors(isVeto, false);
                    updaters.updateDucking(scGain);

                    const isDucked = scGain < 0.999;
                    const culpritSourceBus = lastDuckingSource.current.get(b.busId);
                    const activeEdgeId = `e-sc-${culpritSourceBus}-${b.busId}`;

                    const edgeElements = document.querySelectorAll(`.sc-edge-target-${b.busId}`);
                    edgeElements.forEach(edgeEl => {
                        const path = edgeEl.querySelector('.react-flow__edge-path') as SVGPathElement;
                        if (!path) return;

                        const edgeIdClass = Array.from(edgeEl.classList).find(c => c.startsWith('sc-edge-id-'));
                        const edgeId = edgeIdClass?.replace('sc-edge-id-', '');

                        const isThisTheActiveEdge = edgeId === activeEdgeId;

                        if (isDucked && isThisTheActiveEdge) {
                            if (edgeId) activeScEdges.current.add(edgeId);

                            path.style.stroke = '#ef4444';
                            path.style.strokeWidth = '2px';
                            path.classList.add('react-flow__edge-path--animated');
                        } else {
                            if (edgeId) activeScEdges.current.delete(edgeId);

                            path.style.stroke = '#27272a';
                            path.style.strokeWidth = '1.5px';
                            path.classList.remove('react-flow__edge-path--animated');
                        }
                    });

                    if (!isDucked) {
                        lastDuckingSource.current.delete(b.busId);
                    }
                }
            });

            const currentSnapIds = new Set(snap.activePlaybacks?.map(p => String(p.playbackId)) || []);
            let topologyChanged = false;

            activeVoiceIds.current.forEach(id => {
                if (!currentSnapIds.has(id)) {
                    activeVoiceIds.current.delete(id);
                    topologyChanged = true;
                }
            });

            snap.activePlaybacks?.forEach(p => {
                const id = String(p.playbackId);
                if (!activeVoiceIds.current.has(id)) {
                    activeVoiceIds.current.add(id);
                    topologyChanged = true;
                }

                const updaters = nodeUpdaters.current.get(`voice:${id}`);
                if (updaters) {
                    updaters.updateText(`Vol: ${p.volume.toFixed(2)}\nPos: ${p.positionSec.toFixed(2)}s`);
                    updaters.updateColors(false, p.isVirtual);
                }
            });

            if (topologyChanged && !isLayouting.current) {
                isLayouting.current = true;

                const activeVoiceNodes: Node[] = [];
                const activeVoiceEdges: Edge[] = [];

                snap.activePlaybacks?.forEach(p => {
                    const id = String(p.playbackId);
                    const voiceNodeId = `voice:${id}`;

                    activeVoiceNodes.push({
                        id: voiceNodeId,
                        type: 'audio',
                        position: { x: 0, y: 0 },
                        data: { title: p.soundId, type: 'voice', registerNode, unregisterNode }
                    });

                    const targetBus = manifest.soundMap[p.soundId]?.busId || 'master';
                    activeVoiceEdges.push({
                        id: `e-${voiceNodeId}-bus:${targetBus}`,
                        source: voiceNodeId,
                        target: targetBus === 'master' ? 'master' : `bus:${targetBus}`,
                        type: 'smoothstep'
                    });
                });

                const currentBaseEdges = baseEdges.current.map(edge => {
                    if (activeScEdges.current.has(edge.id)) {
                        return {
                            ...edge,
                            animated: true,
                            style: { ...edge.style, stroke: '#ef4444', strokeWidth: 2 }
                        };
                    } else if (edge.id.startsWith('e-sc-')) {
                        return {
                            ...edge,
                            animated: false,
                            style: { ...edge.style, stroke: '#27272a', strokeWidth: 1.5 }
                        };
                    }
                    return edge;
                });

                const nextNodes = [...baseNodes.current, ...activeVoiceNodes];
                const nextEdges = [...currentBaseEdges, ...activeVoiceEdges];

                void getLayoutedElements(nextNodes, nextEdges).then(({ nodes: layoutedNodes }) => {
                    setNodes(layoutedNodes);
                    setEdges(nextEdges);
                    isLayouting.current = false;
                });
            }

            frameId = requestAnimationFrame(syncLoop);
        };

        frameId = requestAnimationFrame(syncLoop);
        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [snapshotRef, manifest, setNodes, setEdges, registerNode, unregisterNode]);

    return (
        <div className="absolute inset-0 bg-background">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                proOptions={{ hideAttribution: true }}
                minZoom={0.2}
            >
                <Background color="var(--ring)" gap={20} size={1} />
            </ReactFlow>
        </div>
    );
};

export const AudioGraph: React.FC<Props> = props => (
    <ReactFlowProvider>
        <AudioGraphInner {...props} />
    </ReactFlowProvider>
);
