/**
 * Browser host for sandbox runs.
 *
 * Each run gets a new hidden `<iframe sandbox="allow-scripts">` without `allow-same-origin`,
 * so its document and the worker it starts have an opaque origin: no access to this page,
 * its cookies or the site's storage. The frame's Content Security Policy allows only its own
 * bootstrap script, `eval` for the program and the runtime's validators, and a worker created
 * from a local `blob:` URL. Workers created from `blob:` URLs inherit that policy, so the
 * program cannot make network requests or load other scripts.
 *
 * The page talks to the frame over a private MessageChannel. Stopping a run terminates the
 * worker and removes the frame.
 */
import type { SandboxConnection, SandboxHost } from './runner.ts';
import type { ControlMessage, StartMessage } from './protocol.ts';

/** Runs inside the frame. Its hash below must match; a unit test recomputes it. */
export const BOOTSTRAP = `"use strict";
let started = false;
addEventListener("message", (event) => {
  const data = event.data;
  const port = event.ports[0];
  if (started || event.source !== parent || !port || !data || data.type !== "mimlet-sandbox:start") return;
  started = true;
  let worker;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([String(data.runtime)], { type: "text/javascript" })));
  } catch {
    port.postMessage({ type: "fatal", message: "This browser could not start the sandbox worker." });
    return;
  }
  worker.onmessage = (message) => port.postMessage(message.data);
  worker.onerror = (error) => {
    error.preventDefault();
    port.postMessage({ type: "fatal", message: "The sandbox runtime failed to start in this browser." });
  };
  port.onmessage = (message) => {
    if (message.data && message.data.type === "stop") worker.terminate();
  };
  worker.postMessage({ source: String(data.source) });
});`;
export const BOOTSTRAP_HASH = 'sha256-ebEaP4arCV0OStUVeVxMfCvuL8zXC7SsdoJ0ozj4xfE=';
export const FRAME_POLICY = `default-src 'none'; script-src '${BOOTSTRAP_HASH}' 'unsafe-eval'; worker-src blob:; base-uri 'none'; form-action 'none'`;
export const FRAME_SANDBOX = 'allow-scripts';

export function frameDocument(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_POLICY}"><title>Mimlet sandbox runner</title></head><body><script>${BOOTSTRAP}</script></body></html>`;
}

/** How long a stopped frame may take to terminate its worker before it is removed anyway. */
const REMOVE_DELAY_MS = 100;

export function createFrameHost(runtime: string, container: HTMLElement): SandboxHost {
  return {
    start(source, listener): SandboxConnection {
      const document = container.ownerDocument;
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', FRAME_SANDBOX);
      frame.setAttribute('title', 'Mimlet sandbox runner');
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('tabindex', '-1');
      frame.hidden = true;
      frame.srcdoc = frameDocument();
      const channel = new MessageChannel();
      let stopped = false;
      channel.port1.onmessage = (event) => {
        if (!stopped) {
          listener(event.data);
        }
      };
      frame.addEventListener(
        'load',
        () => {
          if (stopped) {
            return;
          }
          const message: StartMessage = { type: 'mimlet-sandbox:start', runtime, source };
          // The frame's origin is opaque, so it cannot be named as the target. The frame is
          // this page's own srcdoc document, and the message holds no secrets.
          frame.contentWindow?.postMessage(message, '*', [channel.port2]);
        },
        { once: true }
      );
      container.append(frame);
      return {
        stop() {
          if (stopped) {
            return;
          }
          stopped = true;
          const stop: ControlMessage = { type: 'stop' };
          channel.port1.postMessage(stop);
          // Removing the frame also ends its worker, but give terminate() a moment first.
          globalThis.setTimeout(() => {
            channel.port1.close();
            frame.remove();
          }, REMOVE_DELAY_MS);
        },
      };
    },
  };
}
