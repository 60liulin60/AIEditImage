import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        ink: '#1f2937',
        panel: '#f6f7fb',
        accent: '#2563eb',
      },
    },
  },
  plugins: [],
} satisfies Config;
