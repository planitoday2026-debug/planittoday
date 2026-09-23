import { spawn, spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const node = process.execPath;
const compile = spawnSync(node, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], { stdio: 'inherit' });
if (compile.status !== 0) process.exit(compile.status || 1);
const env = { ...process.env, NODE_ENV: 'development' };
const children = [
  spawn(node, ['--watch', 'dist/server/server/index.js'], { stdio: 'inherit', env }),
  spawn(node, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit', env }),
  spawn(node, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 2500).unref();
  Promise.all(children.map(c => c.exitCode !== null ? Promise.resolve() : new Promise(r => c.once('exit', r)))).then(() => process.exit(code));
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code || 1); });
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
