import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Some Windows environments cannot resolve a passwd entry, which tsx probes
// during startup. The runner is only used for explicit server-side DB scripts.
os.userInfo = () => ({ uid: -1, gid: -1, username: 'workspace', homedir: process.cwd(), shell: null });

const scriptPath = process.argv[2];
if (!scriptPath) throw new Error('Pass a TypeScript script path to run.');
const { tsImport } = await import('tsx/esm/api');
await tsImport(pathToFileURL(path.resolve(scriptPath)).href, import.meta.url);
