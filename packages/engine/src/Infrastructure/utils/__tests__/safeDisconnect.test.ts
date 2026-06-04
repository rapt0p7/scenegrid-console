import { describe, it, expect, vi } from 'vitest';

import { safeDisconnect } from '../safeDisconnect.js';

describe('safeDisconnect', () => {
    it('should return immediately if node is undefined', () => {
        const result = safeDisconnect(undefined as any);
        expect(result).toBeUndefined();
    });

    it('should disconnect only specific output if provided', () => {
        const node = { disconnect: vi.fn() };
        const output = { destination: {} };

        safeDisconnect(node as any, output as any);

        expect(node.disconnect).toHaveBeenCalledWith(output);
        expect(node.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should return if node has zero outputs', () => {
        const node = {
            numberOfOutputs: 0,
            disconnect: vi.fn()
        };

        safeDisconnect(node as any);

        expect(node.disconnect).not.toHaveBeenCalled();
    });

    it('should call basic disconnect if it is supported', () => {
        const node = {
            numberOfOutputs: 1,
            disconnect: vi.fn()
        };

        safeDisconnect(node as any);

        expect(node.disconnect).toHaveBeenCalledWith();
    });

    it('should fallback to index-based disconnect if basic disconnect fails', () => {
        const disconnect = vi.fn();
        disconnect.mockImplementation(argument => {
            if (argument === undefined) throw new Error('Not supported');
        });

        const node = {
            numberOfOutputs: 2,
            disconnect
        };

        safeDisconnect(node as any);

        expect(disconnect).toHaveBeenCalledTimes(3);
        expect(disconnect).toHaveBeenNthCalledWith(2, 0);
        expect(disconnect).toHaveBeenNthCalledWith(3, 1);
    });

    it('should ignore errors during index-based disconnect loop', () => {
        const disconnect = vi.fn(() => {
            throw new Error('Total failure');
        });

        const node = {
            numberOfOutputs: 1,
            disconnect
        };

        expect(() => {
            safeDisconnect(node as any);
        }).not.toThrow();
        expect(disconnect).toHaveBeenCalledTimes(2);
    });

    it('should not throw if node.numberOfOutputs access itself fails', () => {
        const node = {
            get numberOfOutputs() {
                throw new Error('Access denied');
            },
            disconnect: vi.fn(() => {
                throw new Error('Disconnect failed');
            })
        };

        expect(() => {
            safeDisconnect(node as any);
        }).not.toThrow();
    });
});
