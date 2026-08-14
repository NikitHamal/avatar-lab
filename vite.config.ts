import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import net from 'node:net'

import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))

function checkPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(400)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

function aiProxyServerPlugin(): Plugin {
  return {
    name: 'avatar-lab-ai-proxy-launcher',
    async configureServer() {
      const isRunning = await checkPortOpen(8765)
      if (!isRunning) {
        const pythonProcess = spawn('python', [path.join(root, 'server', 'ai_server.py')], {
          stdio: 'inherit',
          detached: false,
          shell: true,
        })
        pythonProcess.on('error', err => {
          console.warn('[Avatar Lab AI] Failed to auto-start Python proxy:', err.message)
        })
      }
    },
  }
}

export default defineConfig({
  root,
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    aiProxyServerPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
    },
  },
  server: {
    proxy: {
      '/api/ai': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(root, 'dist'),
    emptyOutDir: true,
  },
})
