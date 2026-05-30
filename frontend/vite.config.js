import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    proxy: { '/api': 'http://localhost:8002', '/mcp': 'http://localhost:8002' }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Hashed filenames so the browser never serves a stale bundle after
        // a deploy.
        entryFileNames: 'assets/index-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      }
    }
  }
})
