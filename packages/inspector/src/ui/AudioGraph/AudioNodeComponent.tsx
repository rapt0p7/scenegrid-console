// oxlint-disable max-lines-per-function
// noinspection D

import { Handle, Position } from '@xyflow/react';
import React, { useEffect, useRef } from 'react';

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
            className={`flex min-w-[250px] flex-col ${nodeTypeBg} border-2 ${nodeTypeBorder} rounded-md font-mono text-xs shadow-xl select-none`}
        >
            <div
                className={`px-2 py-1 font-bold text-primary-foreground uppercase ${headerColor} flex items-center justify-between rounded-t-[4px]`}
            >
                <span>{title}</span>
                {!isVoice && !isMaster && (
                    <div className="flex h-1.5 w-16 justify-end overflow-hidden rounded-sm bg-background">
                        <div ref={grBarRef} className="h-full w-0 bg-danger transition-none" />
                    </div>
                )}
            </div>

            <div className="relative flex min-h-[50px]">
                {!isVoice && (
                    <Handle
                        type="target"
                        position={Position.Left}
                        className="audio-node-handle audio-node-handle--target"
                        isConnectable={true}
                    />
                )}

                <div ref={textRef} className="flex-1 px-3 py-2 leading-tight whitespace-pre-wrap text-foreground-muted">
                    Waiting...
                </div>

                {!isMaster && (
                    <Handle
                        type="source"
                        position={Position.Right}
                        className="audio-node-handle audio-node-handle--source"
                        isConnectable={true}
                    />
                )}
            </div>
        </div>
    );
};
