// oxlint-disable max-lines-per-function
// noinspection D

import React, { useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';

export const AudioNodeComponent = ({ id, data }: any) => {
    const { title, type, registerNode, unregisterNode } = data;
    const textRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const grBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (registerNode) {
            registerNode(id, {
                updateText: (text: string) => {
                    if (textRef.current) textRef.current.innerText = text;
                },
                updateColors: (isVeto: boolean, isVirtual: boolean) => {
                    if (containerRef.current) {
                        containerRef.current.style.borderColor = isVeto
                            ? 'var(--danger)'
                            : isVirtual
                              ? 'var(--warning)'
                              : '';
                    }
                },
                updateDucking: (duckingMultiplier: number) => {
                    if (grBarRef.current) {
                        const reductionPercent = (1 - duckingMultiplier) * 100;
                        grBarRef.current.style.width = `${reductionPercent}%`;
                    }
                }
            });
        }
        return () => {
            if (unregisterNode) unregisterNode(id);
        };
    }, [id, registerNode, unregisterNode]);

    const isMaster = type === 'master';
    const isVoice = type === 'voice';

    const nodeTypeBg = isMaster ? 'bg-node-master-bg' : isVoice ? 'bg-node-source-bg' : 'bg-node-bus-bg';
    const nodeTypeBorder = isMaster
        ? 'border-node-master-border'
        : isVoice
          ? 'border-node-source-border'
          : 'border-node-bus-border';
    const headerColor = isMaster ? 'bg-node-master-header' : isVoice ? 'bg-node-source-header' : 'bg-node-bus-header';

    return (
        <div
            ref={containerRef}
            className={`flex flex-col min-w-[250px] ${nodeTypeBg} border-2 ${nodeTypeBorder} rounded-md shadow-xl font-mono text-xs select-none overflow-hidden`}
        >
            <div
                className={`px-2 py-1 font-bold text-primary-foreground uppercase ${headerColor} flex justify-between items-center`}
            >
                <span>{title}</span>
                {!isVoice && !isMaster && (
                    <div className="w-16 h-1.5 bg-background rounded-sm overflow-hidden flex justify-end">
                        <div ref={grBarRef} className="h-full bg-danger w-0 transition-none" />
                    </div>
                )}
            </div>

            <div className="flex relative min-h-[50px]">
                {!isVoice && (
                    <Handle
                        type="target"
                        position={Position.Left}
                        className="w-3 h-3 bg-border border-2 border-background"
                        isConnectable={true}
                    />
                )}

                <div ref={textRef} className="flex-1 px-3 py-2 text-foreground-muted whitespace-pre-wrap leading-tight">
                    Waiting...
                </div>

                {!isMaster && (
                    <Handle
                        type="source"
                        position={Position.Right}
                        className="w-3 h-3 bg-primary border-2 border-background"
                        isConnectable={true}
                    />
                )}
            </div>
        </div>
    );
};
