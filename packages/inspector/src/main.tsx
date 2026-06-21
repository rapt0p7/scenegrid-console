import React from 'react';
import { createRoot } from 'react-dom/client';
import { InspectorApp } from './InspectorApp';
// oxlint-disable-next-line import/no-unassigned-import
import './styles/index.css';

const container = document.querySelector('#inspector-root');

if (!container) {
    throw new Error('Container #inspector-root not found');
}

const root = createRoot(container);

root.render(
    <React.StrictMode>
        <InspectorApp />
    </React.StrictMode>
);
