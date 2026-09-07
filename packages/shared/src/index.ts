/**
 * @scoreboard/shared — pure, framework-free domain logic shared by the server and the
 * web client. Nothing in this package may perform I/O; every function must be
 * deterministic given its inputs so it can be tested with fake time.
 */
export * from './version.js';
export * from './domain/common.js';
export * from './domain/enums.js';
export * from './domain/entities.js';
export * from './domain/live.js';
export * from './domain/inputs.js';
export * from './events/socket.js';
export * from './clock/reducer.js';
export * from './clock/display.js';
export * from './timeout/timeout.js';
export * from './court/score.js';
export * from './ladder/rule.js';
export * from './ladder/engine.js';
export * from './draw/random.js';
export * from './draw/roundRobin.js';
export * from './draw/dates.js';
export * from './draw/assign.js';
export * from './draw/generate.js';
export * from './clash/validate.js';
export * from './finals/template.js';
export * from './finals/resolve.js';
export * from './excel/rows.js';
export * from './theme/tokens.js';
export * from './theme/contrast.js';
export * from './time/format.js';
export * from './idle/nextGame.js';
