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
                        containerRef.current.style.borderColor = isVeto ? '#dc2626' : isVirtual ? '#d97706' : '#27272a';
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
    const headerColor = isMaster ? 'bg-pink-900' : isVoice ? 'bg-emerald-900' : 'bg-indigo-900';

    return (
        <div
            ref={containerRef}
            className="flex flex-col min-w-[250px] bg-zinc-900 border-2 border-zinc-800 rounded-md shadow-xl font-mono text-xs select-none overflow-hidden"
        >
            <div
                className={`px-2 py-1 font-bold text-zinc-300 uppercase ${headerColor} flex justify-between items-center`}
            >
                <span>{title}</span>
                {!isVoice && !isMaster && (
                    <div className="w-16 h-1.5 bg-zinc-950 rounded-sm overflow-hidden flex justify-end">
                        <div ref={grBarRef} className="h-full bg-red-500 w-0 transition-none" />
                    </div>
                )}
            </div>

            <div className="flex relative min-h-[50px]">
                {!isVoice && (
                    <Handle
                        type="target"
                        position={Position.Left}
                        className="w-3 h-3 bg-zinc-700 border-2 border-zinc-900"
                        isConnectable={true}
                    />
                )}

                <div ref={textRef} className="flex-1 px-3 py-2 text-zinc-400 whitespace-pre-wrap leading-tight">
                    Waiting...
                </div>

                {!isMaster && (
                    <Handle
                        type="source"
                        position={Position.Right}
                        className="w-3 h-3 bg-indigo-600 border-2 border-zinc-900"
                        isConnectable={true}
                    />
                )}
            </div>
        </div>
    );
};
