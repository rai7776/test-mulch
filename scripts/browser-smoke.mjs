const DEBUG_URL = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);
const COMMAND_TIMEOUT_MS = Number(process.env.CDP_COMMAND_TIMEOUT_MS || 5000);
const POLL_MS = 200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getPageTarget() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${DEBUG_URL}/json/list`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) throw new Error(`CDP target list returned ${response.status}`);
      const targets = await response.json();
      const page = targets.find(item => item.type === 'page' && /^http:\/\/127\.0\.0\.1:4173\/?/.test(item.url || ''));
      if (page?.webSocketDebuggerUrl) return page;
    } catch (error) {
      lastError = error;
    }
    await sleep(POLL_MS);
  }
  throw lastError || new Error('Timed out waiting for the Smart Reader Chrome target.');
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const exceptions = [];
    let nextId = 1;
    let settled = false;

    const openTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (_) {}
      reject(new Error('Timed out opening Chrome DevTools websocket.'));
    }, COMMAND_TIMEOUT_MS);

    function rejectAll(error) {
      for (const { rej, timer } of pending.values()) {
        clearTimeout(timer);
        rej(error);
      }
      pending.clear();
    }

    socket.addEventListener('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimer);
      resolve({
        exceptions,
        send(method, params = {}) {
          const id = nextId++;
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`Chrome DevTools command timed out: ${method}`));
            }, COMMAND_TIMEOUT_MS);
            pending.set(id, { res, rej, timer, method });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          rejectAll(new Error('Chrome DevTools connection closed.'));
          try { socket.close(); } catch (_) {}
        }
      });
    });

    socket.addEventListener('error', event => {
      const error = new Error(`Chrome DevTools websocket failed: ${event?.message || 'unknown error'}`);
      clearTimeout(openTimer);
      if (!settled) {
        settled = true;
        reject(error);
      }
      rejectAll(error);
    });

    socket.addEventListener('close', () => {
      rejectAll(new Error('Chrome DevTools websocket closed before a response arrived.'));
    });

    socket.addEventListener('message', event => {
      let message;
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data || '{}'));
      } catch (error) {
        console.error('Could not parse Chrome DevTools message:', error);
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        exceptions.push(details?.exception?.description || details?.text || 'Unknown page exception');
        return;
      }
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.rej(new Error(`${entry.method}: ${message.error.message || 'CDP command failed'}`));
      else entry.res(message.result);
    });
  });
}

const probeExpression = `(() => {
  const overlay = document.getElementById('smart-reader-workspace-create-overlay');
  const heading = document.getElementById('workspace-create-title');
  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  const localForageScript = [...document.querySelectorAll('script[src]')]
    .map(node => node.getAttribute('src') || '')
    .find(src => /localforage/i.test(src)) || '';
  const active = window.SmartReaderWorkspaceState?.activeWorkspace || null;
  return {
    readyState: document.readyState,
    localForageType: typeof localforage,
    localForageVersion: typeof localforage !== 'undefined' ? (localforage?.version || '') : '',
    workspaceApi: typeof window.SmartReaderWorkspace,
    workspaceStatePresent: !!window.SmartReaderWorkspaceState,
    activeWorkspace: active ? {
      id: active.id,
      name: active.name,
      setupPending: active.setupPending === true,
      kind: active.kind,
      contentLanguage: active.contentLanguage
    } : null,
    overlayPresent: !!overlay,
    overlayVisible: !!overlay && !overlay.hidden,
    heading: heading?.textContent || '',
    workspaceNameInputPresent: !!document.getElementById('workspace-create-name'),
    localForageScript,
    viewport
  };
})()`;

function validate(state) {
  const failures = [];
  if (state.readyState !== 'complete') failures.push(`document.readyState=${state.readyState}`);
  if (state.localForageType !== 'object' && state.localForageType !== 'function') failures.push(`localforage=${state.localForageType}`);
  if (state.localForageVersion && state.localForageVersion !== '1.10.0') failures.push(`localforage.version=${state.localForageVersion}`);
  if (state.workspaceApi !== 'object') failures.push(`workspace API=${state.workspaceApi}`);
  if (!state.workspaceStatePresent) failures.push('workspace state missing');
  if (!state.activeWorkspace?.setupPending) failures.push('fresh workspace is not setupPending');
  if (!state.overlayPresent) failures.push('workspace setup overlay missing');
  if (!state.overlayVisible) failures.push('workspace setup overlay hidden');
  if (state.heading !== '最初の学習スペースを作成') failures.push(`unexpected heading: ${state.heading || '(empty)'}`);
  if (!state.workspaceNameInputPresent) failures.push('workspace name input missing');
  if (!/localforage@1\.10\.0\/dist\/localforage\.min\.js/.test(state.localForageScript)) failures.push(`unpinned LocalForage src: ${state.localForageScript || '(missing)'}`);
  if (/user-scalable\s*=\s*no/i.test(state.viewport)) failures.push(`viewport blocks zoom: ${state.viewport}`);
  if (/maximum-scale\s*=\s*1(?:\.0)?/i.test(state.viewport)) failures.push(`viewport caps zoom: ${state.viewport}`);
  return failures;
}

async function main() {
  console.log('Waiting for Smart Reader Chrome target...');
  const target = await getPageTarget();
  console.log(`Connecting to Chrome target: ${target.url}`);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
    console.log('Enabling Runtime domain...');
    await cdp.send('Runtime.enable');
    const deadline = Date.now() + TIMEOUT_MS;
    let lastState = null;
    let lastFailures = ['not probed'];

    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: probeExpression,
        returnByValue: true,
        awaitPromise: true
      });
      lastState = result?.result?.value || null;
      lastFailures = lastState ? validate(lastState) : ['probe returned no state'];
      if (lastFailures.length === 0) {
        if (cdp.exceptions.length) {
          throw new Error(`Page raised JavaScript exceptions:\n${cdp.exceptions.join('\n')}`);
        }
        console.log('Smart Reader browser smoke passed.');
        console.log(JSON.stringify(lastState, null, 2));
        return;
      }
      await sleep(POLL_MS);
    }

    throw new Error(`Browser smoke timed out.\nFailures: ${lastFailures.join('; ')}\nState: ${JSON.stringify(lastState, null, 2)}${cdp.exceptions.length ? `\nExceptions:\n${cdp.exceptions.join('\n')}` : ''}`);
  } finally {
    cdp.close();
  }
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error?.stack || error);
    process.exit(1);
  }
);
