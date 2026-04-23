import { defineConfig } from 'vite';

// Al deployar a GitHub Pages como project page
// (https://<user>.github.io/botovejero/) la app debe servir sus assets
// desde ese subpath. `base: './'` usa rutas relativas y funciona
// tanto en project pages como en user pages o cualquier host estático.
export default defineConfig({
  base: './',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
