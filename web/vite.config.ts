import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from '../package.json';

// 前端开发时把 /api 代理到后端，生产环境由后端直接托管构建产物
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 版本号以根 package.json 为唯一来源，界面上通过 __APP_VERSION__ 读取
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:7582',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
