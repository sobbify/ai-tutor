/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Production-only Content-Security-Policy. Kept out of dev because Vite's HMR
 * client injects inline scripts/styles.
 */
function contentSecurityPolicy(apiOrigin: string): Plugin {
  // blob: the 3D avatar's textures are unpacked from its model file and loaded from blob: URLs.
  const connect = ["'self'", 'blob:', apiOrigin, apiOrigin.replace(/^http/, 'ws')].filter(Boolean).join(' ');
  const csp = [
    "default-src 'self'",
    // blob: the 3D avatar's audio worklet; wasm-unsafe-eval: its mesh decoder (WebAssembly only,
    // never JavaScript eval).
    "script-src 'self' blob: 'wasm-unsafe-eval'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // Avatar-provider videos will be served from another origin later: add it here.
    "media-src 'self' blob: data: https:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<!-- CSP -->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

/**
 * Dev-only, http mode: ask FastAPI whether the request's session cookie is valid before serving a
 * learner page, so dev behaves like production (where FastAPI gates the built pages).
 */
function devSessionGate(target: string): Plugin {
  return {
    name: 'dev-session-gate',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '/';
        const isPage =
          req.method === 'GET' && (req.headers.accept ?? '').includes('text/html') && !/^\/(@|src\/|node_modules\/|api\/|admin|in(\/|\?|$))/.test(url);
        if (!isPage) return next();
        try {
          const check = await fetch(`${target}/api/me`, { headers: { cookie: req.headers.cookie ?? '' } });
          if (check.status === 401 || check.status === 403) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end('<!doctype html><title>AI Tutor</title><h1>Session not available</h1><p>Open AI Tutor again from the app.</p>');
            return;
          }
        } catch {
          /* backend not running: let the page load and show its own error */
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiOrigin = env.VITE_API_BASE_URL ? new URL(env.VITE_API_BASE_URL).origin : '';
  const backend = env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8000';
  const httpMode = env.VITE_API_MODE === 'http';
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(apiOrigin), ...(httpMode ? [devSessionGate(backend)] : [])],
    resolve: {
      alias: [
        // Real (http) production builds never use the demo mock API: swap it for a stub so its code
        // and practice scripts (~40 KB) stay out of the bundle teachers download.
        ...(command === 'build' && env.VITE_API_MODE !== 'mock'
          ? [{ find: /^\.\/mock\/mockApi$/, replacement: fileURLToPath(new URL('./src/api/mockStub.ts', import.meta.url)) }]
          : []),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    server: {
      port: 5173,
      // Forward the backend's routes in http mode. Keys starting with ^ are regexes on the URL
      // including the query — a plain '/in' would also swallow '/index.html'.
      proxy: httpMode
        ? {
            '^/in/?(\\?|$)': { target: backend },
            '^/api/': { target: backend },
            // Realtime reply capture (Gemini Live relay)
            '^/ws/': { target: backend.replace(/^http/, 'ws'), ws: true },
          }
        : undefined,
    },
    build: { target: 'es2022', sourcemap: true, cssCodeSplit: true },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
