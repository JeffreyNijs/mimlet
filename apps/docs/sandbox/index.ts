/** Page-side sandbox API, used by the docs component and the cross-browser smoke test. */
export { createFrameHost, FRAME_POLICY, FRAME_SANDBOX } from './frame.ts';
export { presets, type SandboxPreset } from './presets.ts';
export { SANDBOX_MODULES, type ErrorReport, type OutputEntry } from './protocol.ts';
export {
  runSandbox,
  TIME_LIMITS_MS,
  type RunOptions,
  type RunResult,
  type RunStatus,
  type SandboxHost,
} from './runner.ts';
