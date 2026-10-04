<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, useId, watch } from 'vue';
import { withBase } from 'vitepress';
import { sandboxRuntime } from '../../.generated/sandbox-runtime.ts';
import { createFrameHost } from '../../sandbox/frame.ts';
import { presets } from '../../sandbox/presets.ts';
import { SANDBOX_MODULES, type OutputEntry } from '../../sandbox/protocol.ts';
import { runSandbox, TIME_LIMITS_MS, type RunResult } from '../../sandbox/runner.ts';

const id = useId();
const presetId = ref(presets[0]!.id);
const sources = reactive<Record<string, string>>(
  Object.fromEntries(presets.map((preset) => [preset.id, preset.source]))
);
const preset = computed(() => presets.find((item) => item.id === presetId.value) ?? presets[0]!);
const source = computed({
  get: () => sources[presetId.value] ?? '',
  set: (value: string) => {
    sources[presetId.value] = value;
  },
});
const edited = computed(() => source.value !== preset.value.source);
const timeLimit = ref<number>(5_000);
const phase = ref<'idle' | 'loading' | 'running'>('idle');
const busy = computed(() => phase.value !== 'idle');
const entries = ref<OutputEntry[]>([]);
const result = shallowRef<RunResult>();
const status = ref('Choose an example, edit it if you like, then run it.');
const frames = ref<HTMLElement>();
const runtimeSize = `${Math.round(sandboxRuntime.gzipBytes / 1024)} KB`;
const modules = SANDBOX_MODULES.join(', ');
let controller: AbortController | undefined;
let runtime: Promise<string> | undefined;

function loadRuntime(): Promise<string> {
  runtime ??= globalThis
    .fetch(withBase(`/${sandboxRuntime.path}`))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    })
    .catch((error: unknown) => {
      runtime = undefined;
      throw error;
    });
  return runtime;
}

function describe(outcome: RunResult, limitMs: number): string {
  const more = outcome.truncated ? ' Some output was over the limit and is not shown.' : '';
  switch (outcome.status) {
    case 'completed':
      return `Finished in ${outcome.durationMs ?? 0} ms.${more}`;
    case 'failed':
      return `The program threw ${outcome.error?.name ?? 'an error'} after ${outcome.durationMs ?? 0} ms.${more}`;
    case 'timeout':
      return `Stopped after the ${limitMs / 1000} second time limit.${more}`;
    case 'stopped':
      return `Stopped.${more}`;
    default:
      return outcome.message ?? 'The sandbox could not run the program.';
  }
}

async function run(): Promise<void> {
  if (busy.value || !frames.value) {
    return;
  }
  const current = new AbortController();
  const limitMs = timeLimit.value;
  controller = current;
  entries.value = [];
  result.value = undefined;
  phase.value = 'loading';
  status.value = `Loading the sandbox runtime (about ${runtimeSize}).`;
  let code: string | undefined;
  try {
    code = await loadRuntime();
  } catch {
    code = undefined;
  }
  // A newer action (Stop, another example, leaving the page) owns the state now.
  if (controller !== current) {
    return;
  }
  if (code === undefined || current.signal.aborted || !frames.value) {
    controller = undefined;
    phase.value = 'idle';
    status.value =
      code === undefined
        ? 'Could not load the sandbox runtime. Check your connection and try again.'
        : 'Stopped.';
    return;
  }
  phase.value = 'running';
  status.value = 'Running.';
  const outcome = await runSandbox(createFrameHost(code, frames.value), source.value, {
    timeLimitMs: limitMs,
    signal: current.signal,
    onEntry: (entry) => {
      entries.value.push(entry);
    },
  });
  if (controller !== current) {
    return;
  }
  controller = undefined;
  entries.value = [...outcome.entries];
  result.value = outcome;
  phase.value = 'idle';
  status.value = describe(outcome, limitMs);
}

function stop(): void {
  controller?.abort();
}

/** Ends any run and forgets it, so its late result cannot overwrite newer state. */
function discard(): void {
  controller?.abort();
  controller = undefined;
  phase.value = 'idle';
}

function reset(): void {
  if (!busy.value && edited.value) {
    source.value = preset.value.source;
    status.value = 'Example restored.';
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void run();
  } else if (event.key === 'Escape' && busy.value) {
    event.preventDefault();
    stop();
  }
}

watch(presetId, () => {
  discard();
  entries.value = [];
  result.value = undefined;
  status.value = 'Example loaded. Run it when you are ready.';
});
onBeforeUnmount(discard);
</script>

<template>
  <section class="mimlet-sandbox" aria-label="Mimlet sandbox">
    <div class="sandbox-settings">
      <label class="sandbox-field sandbox-example">
        Example
        <select v-model="presetId">
          <option v-for="item in presets" :key="item.id" :value="item.id">{{ item.label }}</option>
        </select>
      </label>
      <label class="sandbox-field">
        Time limit
        <select v-model.number="timeLimit">
          <option v-for="limit in TIME_LIMITS_MS" :key="limit" :value="limit">
            {{ limit / 1000 }} seconds
          </option>
        </select>
      </label>
    </div>
    <p class="sandbox-summary">
      {{ preset.summary }}
      <a :href="withBase(preset.guide)">{{ preset.guideLabel }}</a>
    </p>
    <label class="sandbox-editor-label" :for="`${id}-code`">Code</label>
    <textarea
      :id="`${id}-code`"
      v-model="source"
      class="sandbox-editor"
      rows="22"
      wrap="off"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      :aria-describedby="`${id}-hint`"
      @keydown="onKeydown"
    />
    <p :id="`${id}-hint`" class="sandbox-hint">
      JavaScript, with imports from {{ modules }}. Press Ctrl+Enter or Cmd+Enter to run, and Escape
      to stop. Tab moves to the next control.
    </p>
    <div class="sandbox-actions">
      <button
        type="button"
        class="sandbox-run"
        :aria-disabled="busy ? 'true' : 'false'"
        @click="run"
      >
        Run
      </button>
      <button type="button" :aria-disabled="busy ? 'false' : 'true'" @click="stop">Stop</button>
      <button type="button" :aria-disabled="busy || !edited ? 'true' : 'false'" @click="reset">
        Reset example
      </button>
    </div>
    <p class="sandbox-status" role="status" aria-live="polite">{{ status }}</p>
    <section class="sandbox-output" aria-label="Output">
      <p class="sandbox-label">Output</p>
      <p v-if="!entries.length && !result?.exports.length && !result?.error" class="sandbox-empty">
        {{ busy ? 'Waiting for output.' : 'Run the example to see its output here.' }}
      </p>
      <ol v-if="entries.length" class="sandbox-log" aria-label="Console output">
        <li v-for="(entry, index) in entries" :key="index" :class="`sandbox-entry-${entry.level}`">
          <span v-if="entry.level !== 'log'" class="sandbox-level">{{ entry.level }}</span>
          <pre>{{ entry.text }}</pre>
        </li>
      </ol>
      <dl v-if="result?.exports.length" class="sandbox-exports" aria-label="Exported values">
        <template v-for="item in result.exports" :key="item.name">
          <dt>export {{ item.name }}</dt>
          <dd>
            <pre>{{ item.text }}</pre>
          </dd>
        </template>
      </dl>
      <div v-if="result?.error" class="sandbox-error" role="group" aria-label="Error">
        <p class="sandbox-error-title">
          <strong>{{ result.error.name }}</strong
          ><template v-if="result.error.code">
            · <code>{{ result.error.code }}</code></template
          ><template v-if="result.error.line"> · line {{ result.error.line }}</template>
        </p>
        <p v-if="result.error.message" class="sandbox-error-message">{{ result.error.message }}</p>
        <ul v-if="result.error.issues?.length" aria-label="Validation issues">
          <li v-for="(issue, index) in result.error.issues" :key="index">
            <code>{{ issue.path || '(root)' }}</code
            >: {{ issue.message }}
          </li>
        </ul>
        <p v-if="result.error.cause" class="sandbox-error-cause">
          Cause: {{ result.error.cause.name
          }}<template v-if="result.error.cause.code"> {{ result.error.cause.code }}</template
          >: {{ result.error.cause.message }}
        </p>
        <p v-if="result.error.name === 'SyntaxError'" class="sandbox-error-hint">
          The sandbox runs JavaScript. If you pasted TypeScript, remove the type annotations and run
          it again.
        </p>
      </div>
    </section>
    <div ref="frames" class="sandbox-frames" />
  </section>
</template>

<style scoped>
.mimlet-sandbox {
  border: 1px solid var(--rule);
  border-radius: 20px;
  padding: 24px;
  margin: 28px 0;
  background: var(--vp-c-bg-alt);
  min-width: 0;
}
.sandbox-settings,
.sandbox-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
.sandbox-field {
  display: grid;
  gap: 6px;
  flex: 0 1 180px;
  font-weight: 600;
  min-width: 0;
}
.sandbox-example {
  flex: 1 1 280px;
}
select,
.sandbox-editor {
  border: 1px solid var(--muted);
  border-radius: 7px;
  background: var(--paper);
  color: var(--ink);
  width: 100%;
  min-width: 0;
}
select {
  /* Native menus ignore padding and height in Safari, so draw the arrow here. */
  appearance: none;
  padding: 10px 36px 10px 10px;
  min-height: 44px;
  font: inherit;
  font-weight: 400;
  background-image:
    linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position:
    calc(100% - 19px) 50%,
    calc(100% - 14px) 50%;
  background-size: 5px 5px;
  background-repeat: no-repeat;
}
.sandbox-summary {
  margin: 16px 0;
}
.sandbox-editor-label,
.sandbox-label {
  display: block;
  margin: 0 0 6px;
  font-weight: 650;
}
.sandbox-editor {
  display: block;
  padding: 14px;
  font: 13px/1.6 var(--vp-font-family-mono);
  white-space: pre;
  overflow: auto;
  resize: vertical;
  tab-size: 2;
}
.sandbox-hint {
  font-size: 14px;
  color: var(--muted);
}
.sandbox-actions button {
  border: 1px solid var(--ink);
  border-radius: 8px;
  background: var(--paper);
  color: var(--ink);
  padding: 10px 16px;
  font-weight: 650;
  min-height: 44px;
}
.sandbox-actions .sandbox-run {
  background: var(--ink);
  color: var(--paper);
}
.sandbox-actions button[aria-disabled='true'] {
  cursor: not-allowed;
  background: var(--vp-c-bg-soft);
  color: var(--muted);
  border-color: var(--rule);
}
button:focus-visible,
select:focus-visible,
.sandbox-editor:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.sandbox-status {
  min-height: 1.6em;
  font-weight: 600;
}
.sandbox-output {
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--paper);
  padding: 16px;
  min-width: 0;
}
.sandbox-empty {
  margin: 0;
  color: var(--muted);
}
.sandbox-output pre {
  margin: 0;
  font: 13px/1.6 var(--vp-font-family-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--ink);
}
.vp-doc .sandbox-log {
  list-style: none;
  padding: 0;
  margin: 0;
}
.vp-doc .sandbox-log li {
  margin: 0;
  padding: 6px 0;
  border-bottom: 1px solid var(--rule);
}
.vp-doc .sandbox-log li:last-child {
  border-bottom: 0;
}
.sandbox-level {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.sandbox-entry-warn .sandbox-level {
  color: var(--vp-c-warning-1);
}
.sandbox-entry-error .sandbox-level,
.sandbox-error-title strong {
  color: var(--vp-c-danger-1);
}
.sandbox-exports {
  margin: 12px 0 0;
}
.sandbox-exports dt {
  font-weight: 650;
}
.sandbox-exports dd {
  margin: 4px 0 10px;
}
.sandbox-error {
  margin-top: 12px;
  padding: 12px 14px;
  border-left: 4px solid var(--vp-c-danger-1);
  background: var(--vp-c-bg-alt);
  border-radius: 0 8px 8px 0;
  overflow-wrap: anywhere;
}
.sandbox-error p {
  margin: 4px 0;
}
.vp-doc .sandbox-error ul {
  margin: 8px 0;
  padding-left: 20px;
}
.vp-doc .sandbox-error li {
  margin: 4px 0;
}
.sandbox-frames {
  display: none;
}
@media (max-width: 500px) {
  .mimlet-sandbox {
    padding: 16px;
  }
  .sandbox-field,
  .sandbox-actions button {
    flex: 1 1 100%;
  }
}
</style>
