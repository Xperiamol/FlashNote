import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'jsx-mime-type',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.endsWith('.jsx')) {
            res.setHeader('Content-Type', 'application/javascript')
          }
          next()
        })
      }
    }
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        standalone: resolve(__dirname, 'standalone.html')
      }
    }
  },
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      strict: false
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
})