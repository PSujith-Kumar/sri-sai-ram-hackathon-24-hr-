import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The companion talks to a local Ollama server (Gemma 3) through /ollama, so the browser never hits CORS.
// ...and to the fine-tuned mood model service (python ml/serve.py) through /classifier.
const ollama = {
  '/ollama': { target: 'http://127.0.0.1:11434', changeOrigin: true, rewrite: (path) => path.replace(/^\/ollama/, '') },
  '/classifier': { target: 'http://127.0.0.1:8765', changeOrigin: true, rewrite: (path) => path.replace(/^\/classifier/, '') },
}

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: ollama },
  preview: { proxy: ollama },
})
