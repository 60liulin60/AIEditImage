import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5175,
    proxy: {
      // 开发阶段统一代理后端，前端请求可保持 /api 相对路径。
      '/api': {
        target: 'http://localhost:3033',
        changeOrigin: true,
      },
    },
  },
});
