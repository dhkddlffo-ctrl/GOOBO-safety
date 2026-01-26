import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: [
      '3000-iem1815jj5210nwgzwhx6-583b4d74.sandbox.novita.ai',
      '.sandbox.novita.ai'
    ]
  }
})
