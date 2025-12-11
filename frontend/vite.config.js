import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'os'

const getLocalIp = () => {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
      if (net.family === familyV4Value && !net.internal) {
        return net.address
      }
    }
  }
  return 'localhost'
}

const hostIp = process.env.VITE_HOST_IP || getLocalIp()
const backendUrl = process.env.VITE_BACKEND_URL || `http://${hostIp}:8000/api`
const allowedHostsEnv = process.env.VITE_ALLOWED_HOSTS || hostIp
const allowedHosts = allowedHostsEnv.split(',').map(h => h.trim()).filter(Boolean)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 80,
    allowedHosts
  },
  define: {
    'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
    'import.meta.env.VITE_ALLOWED_HOSTS': JSON.stringify(allowedHostsEnv),
    'import.meta.env.VITE_HOST_IP': JSON.stringify(hostIp)
  }
})
