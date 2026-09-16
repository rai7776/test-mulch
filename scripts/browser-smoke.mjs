const DEBUG_URL = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);
const POLL_MS = 200;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getPageTarget() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${DEBUG_URL}/json/list`);
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

    const timer = setTimeout(() => reject(new Error('Timed out opening Chrome DevTools websocket.')), 5000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({
        exceptions,
        async send(method, params = {}) {
          const id = nextId++;
          const result = new Promise((res, rej) => pending.set(id, { res, rej }));
          socket.send(JSON.stringify({ id, method, params }));
          return result;
        },
        close() {
          try { socket.close(); } catch (_) {}
        }
      });
    });
    socket.addEventListener('error', event => {
      clearTimeout(timer);
      reject(new Error(`Chrome DevTools websocket failed: ${event?.message || 'unknown error'}`));
    });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data || '{}'));
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params?.exceptionDetails;
        exceptions.push(details?.exception?.description || details?.text || 'Unknown page exception');
        return;
      }
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(message.error.message || 'CDP command failed'));
      else res(message.result);
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
  const target = await getPageTarget();
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
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
