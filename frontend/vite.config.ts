/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig({
  plugins: [
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: [
        'vue',
        'vue-router',
        'pinia',
        {
          'element-plus': ['ElMessage', 'ElMessageBox'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: 'src/components.d.ts',
    }),
  ],
  server: {
    // 固定开发端口便于和根目录脚本、后端代理保持一致。
    port: 5175,
    proxy: {
      // 开发阶段统一代理后端，前端请求可保持 /api 相对路径。
      '/api': {
        target: 'http://localhost:3033',
        changeOrigin: true,
      },
    },
  },
  test: {
    // 组件测试需要 DOM 环境；全局 API 免去每个用例重复 import describe/it/expect。
    environment: 'jsdom',
    globals: true,
    // 自动导入的 ElMessage/ElMessageBox 等在测试中按需 mock，这里仅提供基础环境。
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
