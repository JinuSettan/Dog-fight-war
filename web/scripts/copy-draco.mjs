// Copies the Draco decoder (needed by Google 3D Tiles) from three into public/draco so it works offline / in the APK.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const src = resolve('node_modules/three/examples/jsm/libs/draco/gltf');
const dst = resolve('public/draco');
if (!existsSync(src)) { console.warn('[copy-draco] three not installed yet, skipping'); process.exit(0); }
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log('[copy-draco] ok ->', dst);
