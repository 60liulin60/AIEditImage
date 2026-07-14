import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // 深色侧边栏和品牌底色
        sidebar: {
          DEFAULT: '#0f172a',
          light: '#1e293b',
          dark: '#020617',
        },
        // 暖色点缀色用于强调、选中态和品牌感
        warm: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          dark: '#d97706',
        },
        // 表面色层次用于卡片、面板和内容区
        surface: {
          DEFAULT: '#ffffff',
          alt: '#f8fafc',
          raised: '#ffffff',
          overlay: 'rgba(15, 23, 42, 0.04)',
        },
        // 语义色保持一致
        ink: '#1f2937',
        panel: '#f6f7fb',
        accent: '#2563eb',
        muted: '#6b7280',
      },
      fontFamily: {
        display: ['Outfit', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        body: ['"Noto Sans SC"', 'Outfit', 'system-ui', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(15, 23, 42, 0.04), 0 6px 24px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 4px 12px rgba(15, 23, 42, 0.08), 0 12px 32px rgba(15, 23, 42, 0.10)',
        panel: '0 12px 28px rgba(15, 23, 42, 0.06)',
        glass: '0 8px 32px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
        glow: '0 0 20px rgba(245, 158, 11, 0.3), 0 0 40px rgba(245, 158, 11, 0.1)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-border': {
          '0%, 100%': { borderColor: 'rgba(245, 158, 11, 0.4)' },
          '50%': { borderColor: 'rgba(245, 158, 11, 0.8)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out both',
        'slide-in-left': 'slide-in-left 0.4s ease-out both',
        'scale-in': 'scale-in 0.3s ease-out both',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-border': 'pulse-border 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
