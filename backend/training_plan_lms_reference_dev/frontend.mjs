// This development launcher changes no application or production configuration.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const frontend = fileURLToPath(new URL('../../frontend/', import.meta.url));
process.chdir(frontend);
const { createServer } = await import(pathToFileURL(resolve(frontend, 'node_modules/vite/dist/node/index.js')).href);
process.env.VITE_ENABLE_ACTIVITY_TRACKING = 'false';
process.env.VITE_ENABLE_REALTIME = 'false';

const server = await createServer({
  root: frontend,
  configFile: resolve(frontend, 'vite.config.ts'),
  envFile: false,
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 3100,
    strictPort: true,
    fs: {
      allow: [frontend],
      deny: ['.env', '.env.*', '**/private/**', '**/*.pem', '**/*.key'],
    },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8101', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8101', changeOrigin: true },
    },
  },
});
await server.listen();
server.printUrls();
