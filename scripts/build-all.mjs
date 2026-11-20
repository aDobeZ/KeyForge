import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const pwaDir = path.join(rootDir, 'dist', 'pwa');
const extDir = path.join(rootDir, 'dist', 'extension');
const standalonePath = path.join(rootDir, 'dist', 'mylesspass-standalone.html');

async function main() {
  console.log('1/3 Building PWA bundle...');
  await build();

  console.log('2/3 Packaging Browser Extension (Manifest V3)...');
  fs.rmSync(extDir, { recursive: true, force: true });
  fs.cpSync(pwaDir, extDir, { recursive: true });

  const extManifestSrc = path.join(extDir, 'extension-manifest.json');
  const extManifestDest = path.join(extDir, 'manifest.json');
  if (fs.existsSync(extManifestSrc)) {
    fs.renameSync(extManifestSrc, extManifestDest);
  }
  // Remove PWA-only files from extension package
  for (const file of ['sw.js', 'manifest.webmanifest']) {
    const p = path.join(extDir, file);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  // Also remove extension-manifest.json from PWA output
  const pwaExtManifest = path.join(pwaDir, 'extension-manifest.json');
  if (fs.existsSync(pwaExtManifest)) fs.rmSync(pwaExtManifest);

  console.log('3/3 Generating standalone single-file HTML...');
  let html = fs.readFileSync(path.join(pwaDir, 'index.html'), 'utf-8');

  // Inline stylesheet
  html = html.replace(
    /<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi,
    (_match, href) => {
      const cssPath = path.join(pwaDir, href.replace(/^\.\//, ''));
      if (!fs.existsSync(cssPath)) return '';
      const css = fs.readFileSync(cssPath, 'utf-8');
      return `<style>\n${css}\n</style>`;
    }
  );

  // Inline module script
  html = html.replace(
    /<script\s+type="module"[^>]*src="([^"]+)"[^>]*><\/script>/gi,
    (_match, src) => {
      const jsPath = path.join(pwaDir, src.replace(/^\.\//, ''));
      if (!fs.existsSync(jsPath)) return '';
      const js = fs.readFileSync(jsPath, 'utf-8');
      return `<script type="module">\n${js}\n</script>`;
    }
  );

  // Strip manifest/sw links in standalone file
  html = html.replace(/<link\s+rel="manifest"[^>]*>/gi, '');

  fs.writeFileSync(standalonePath, html, 'utf-8');

  console.log('\nBuild complete!');
  console.log(`- Browser Extension: ${extDir}`);
  console.log(`- PWA Static Site:   ${pwaDir}`);
  console.log(`- Standalone HTML:   ${standalonePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
