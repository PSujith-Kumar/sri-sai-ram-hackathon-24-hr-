import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { phoneLinkPlugin } from './server/phonePlugin.js'

// Local services reached through same-origin proxies, so the browser never hits CORS:
//   /ollama      Gemma 3 conversation (Ollama)
//   /classifier  fine-tuned mood model (python ml/serve.py)
//   /openrouter  ClinicCompass route analysis (https://openrouter.ai). The API key is added HERE, on the server,
//                from OPENROUTER_API_KEY in .env.local (git-ignored). It is never sent to or stored in the browser.
const localServices = {
  '/ollama': { target: 'http://127.0.0.1:11434', changeOrigin: true, rewrite: (path) => path.replace(/^\/ollama/, '') },
  '/classifier': { target: 'http://127.0.0.1:8765', changeOrigin: true, rewrite: (path) => path.replace(/^\/classifier/, '') },
}

const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }

/** Answers /openrouter/status and refuses (503) before forwarding anything when no key is configured. */
const openRouterGuard = (key) => {
  const middleware = (req, res, next) => {
    if (req.url === '/status') return json(res, 200, { hasKey: Boolean(key) })
    if (!key) return json(res, 503, { error: 'OPENROUTER_API_KEY is not set' })
    return next()
  }
  return {
    name: 'openrouter-guard',
    // block bodies on purpose: Vite treats a returned function from configureServer as a "post" hook
    configureServer(server) { server.middlewares.use('/openrouter', middleware) },
    configurePreviewServer(server) { server.middlewares.use('/openrouter', middleware) },
  }
}

export default defineConfig(({ mode }) => {
  const key = loadEnv(mode, process.cwd(), '').OPENROUTER_API_KEY || ''
  const proxy = {
    ...localServices,
    '/openrouter': {
      target: 'https://openrouter.ai', changeOrigin: true, rewrite: (path) => path.replace(/^\/openrouter/, '/api'),
      configure: (p) => p.on('proxyReq', (req) => {
        req.setHeader('Authorization', `Bearer ${key}`)
        req.setHeader('HTTP-Referer', 'http://localhost')
        req.setHeader('X-OpenRouter-Title', 'CareBridge ClinicCompass')
      }),
    },
  }
  return {
    plugins: [react(), openRouterGuard(key), phoneLinkPlugin()],
    build: { outDir: 'dist', emptyOutDir: true },
    server: { proxy },
    preview: { proxy },
  }
})
