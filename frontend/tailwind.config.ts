import type { Config } from 'tailwindcss';

export default {
  // 只扫描前端入口和源码，避免 Tailwind 处理后端或依赖目录。
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      // 颜色命名对应全局 SCSS 的基础视觉语义，保持页面配色一致。
      colors: {
        ink: '#1f2937',
        panel: '#f6f7fb',
        accent: '#2563eb',
      },
    },
  },
  plugins: [],
} satisfies Config;
