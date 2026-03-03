import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#070b12',
        panel: '#0d131d',
        edge: '#1d2a3a',
        glow: '#7dd3fc',
        signal: '#f97316'
      },
      boxShadow: {
        radar: '0 0 0 1px rgba(125,211,252,0.12), 0 24px 60px rgba(2,8,23,0.55)'
      },
      backgroundImage: {
        grid: 'radial-gradient(circle at center, rgba(125,211,252,0.18) 0, rgba(125,211,252,0.02) 1px, transparent 1px)'
      }
    }
  },
  plugins: []
};

export default config;
