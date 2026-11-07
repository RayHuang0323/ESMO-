// The corrected tactical AI/smoke/presentation rules are opt-in by scene.
// Shipped legacy/v1 and the first prototype retain their original behavior.
export const isFpsTacticalNetworkScene=version=>version==='major.v3'||version==='major.v4'||version==='major.v5';
export const isFpsCalibratedPovScene=(version,layout)=>version==='major.v3'&&layout==='esmo-confluence.v3.3'||version==='major.v4'&&['esmo-dune-terminal.v4.1','esmo-dune-terminal.v4.2'].includes(layout)||version==='major.v5'&&['esmo-foundry-circuit.v5.1','esmo-foundry-circuit.v5.2'].includes(layout);
