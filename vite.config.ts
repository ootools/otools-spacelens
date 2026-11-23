import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 独立仓库：本文件不依赖宿主 OTools 仓的任何脚本/别名。
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('./plugin.json', import.meta.url)), 'utf8'),
) as { uuid?: string; packid?: string };

const pluginIdentity = manifest.uuid?.trim() || manifest.packid?.trim() || '';

export default defineConfig({
  base: './',
  plugins: [vue()],
  define: {
    __OTOOLS_PLUGIN_UUID__: JSON.stringify(pluginIdentity),
  },
  server: {
    host: '127.0.0.1',
    port: 6582,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
