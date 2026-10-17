// Lightweight worker bootstrap: stage marker precedes Vite/product API imports.
import os from 'node:os';
console.log(`HARNESS_STAGE ${JSON.stringify({ stage: 'worker-bootstrap-before-imports', pid: process.pid, nodeVersion: process.version, memory: process.memoryUsage(), availablePhysicalBytes: os.freemem(), time: new Date().toISOString() })}`);
await import('./check_cs_gameplay_authenticity_match.mjs');
