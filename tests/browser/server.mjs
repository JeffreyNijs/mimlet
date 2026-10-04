/**
 * Test-only server exposes a fixed set of packed core ESM files for browser conformance,
 * and the docs sandbox bundles that scripts/test-browser.mjs builds into ./sandbox.
 */
import { startPlayground } from '@mimlet/playground';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
const playground = await startPlayground({ port: 4179 });
const directory = fileURLToPath(new URL('.', import.meta.resolve('@mimlet/core')));
const modules = new Map();
for (const name of await readdir(directory)) {
  if (/^[a-zA-Z0-9_-]+\.js$/.test(name)) {
    modules.set(`/core/${name}`, await readFile(`${directory}/${name}`));
  }
}
for (const name of ['host.js', 'runtime.js']) {
  modules.set(`/sandbox/${name}`, await readFile(new URL(`./sandbox/${name}`, import.meta.url)));
}
const sandboxPage = `<!doctype html><html lang="en"><title>Sandbox smoke</title><body><main>Sandbox smoke<div id="frames"></div></main>
<script type="module">
import { createFrameHost, presets, runSandbox } from '/sandbox/host.js';
const runtime = await (await fetch('/sandbox/runtime.js')).text();
globalThis.sandboxPresets = presets;
globalThis.runInSandbox = (source, { timeLimitMs = 5000, stopAfterMs } = {}) => {
  const controller = new AbortController();
  if (stopAfterMs) setTimeout(() => controller.abort(), stopAfterMs);
  const host = createFrameHost(runtime, document.getElementById('frames'));
  return runSandbox(host, source, { timeLimitMs, signal: controller.signal });
};
document.body.dataset.ready = 'true';
</script></body></html>`;
// Sandbox programs try to reach this URL; the count shows whether any request arrived.
let probes = 0;
const core = createServer((request, response) => {
  const source = modules.get(request.url);
  response.setHeader('cache-control', 'no-store');
  if (request.url === '/sandbox-probe') {
    probes++;
    response.writeHead(200, { 'access-control-allow-origin': '*' });
    response.end('reached');
  } else if (request.url === '/sandbox-probe-count') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(String(probes));
  } else if (request.url === '/sandbox/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(sandboxPage);
  } else if (source) {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(source);
  } else if (request.url === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><html lang="en"><title>Core conformance</title><body><main>Core conformance</main></body></html>'
    );
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve, reject) => {
  core.once('error', reject);
  core.listen(4180, '127.0.0.1', resolve);
});
let stopping;
const stop = () => {
  stopping ??= Promise.all([
    playground.close(),
    new Promise((resolve, reject) => {
      core.close((error) => (error ? reject(error) : resolve()));
      core.closeAllConnections();
    }),
  ]).catch(() => {
    process.exitCode = 1;
  });
};
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
