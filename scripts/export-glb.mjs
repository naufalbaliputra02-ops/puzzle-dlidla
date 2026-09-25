// Builds the procedural assets and writes binary glTF files to public/models.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createDliHero, createDliEcho } from '../src/assets/dliHero.js';
import { createHeroAnimations } from '../src/assets/animations.js';
import { createDlicomBadge } from '../src/assets/dlicomLogo.js';

// GLTFExporter's binary path relies on the browser FileReader.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const outDir = fileURLToPath(new URL('../public/models/', import.meta.url));
const exporter = new GLTFExporter();

async function exportGlb(file, object, animations = []) {
  object.updateMatrixWorld(true);
  const glb = await exporter.parseAsync(object, { binary: true, animations, onlyVisible: true });
  await writeFile(outDir + file, Buffer.from(glb));
  let tris = 0;
  object.traverse((o) => {
    if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  console.log(`${file.padEnd(18)} ${(glb.byteLength / 1024).toFixed(1).padStart(7)} KB  ${Math.round(tris)} tris  ${animations.map((a) => a.name).join(', ')}`);
}

await mkdir(outDir, { recursive: true });
await exportGlb('dli-hero.glb', createDliHero(), createHeroAnimations());
await exportGlb('dli-echo.glb', createDliEcho());
await exportGlb('dlicom-badge.glb', createDlicomBadge({ size: 0.6 }));
