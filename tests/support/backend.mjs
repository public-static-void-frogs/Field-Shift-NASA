import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';

// Exercise the actual HTTP boundary using a fresh, isolated demo repository per test file.
const directory = fileURLToPath(new URL('../../../Field-Shift-NASA/backend', import.meta.url));
const virtualenv = `${directory}/.venv/bin/python`;
const python = process.env.NASA_BACKEND_PYTHON ?? (existsSync(virtualenv) ? virtualenv : 'python3');
const server = spawn(
  python,
  [
    '-u',
    '-c',
    `
import socket
import uvicorn
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
sock.listen(128)
print(f'READY_PORT={sock.getsockname()[1]}', flush=True)
uvicorn.Server(uvicorn.Config('app.main:app', log_level='error')).run(sockets=[sock])
`,
  ],
  { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] },
);
let errors = '';
server.stderr.on('data', (data) => {
  errors += data;
});
const nativeFetch = globalThis.fetch;
const originalApiUrl = process.env.VITE_API_BASE_URL;
let baseUrl;
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Backend startup timed out. ${errors}`)),
      10000,
    );
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Backend exited (${code}). Install backend requirements. ${errors}`));
    });
    server.stdout.on('data', (data) => {
      const match = String(data).match(/READY_PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await nativeFetch(baseUrl);
      if (response.ok) {
        break;
      }
    } catch {
      /* Wait for uvicorn to finish loading the application. */
    }
    if (attempt === 99) {
      throw new Error(`Backend is unavailable. ${errors}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
} catch (error) {
  server.kill();
  throw error;
}
process.env.VITE_API_BASE_URL = `${baseUrl}/api/v1`;
after(() => {
  if (originalApiUrl === undefined) {
    delete process.env.VITE_API_BASE_URL;
  } else {
    process.env.VITE_API_BASE_URL = originalApiUrl;
  }
  server.kill();
});
