/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Geoff cybersecurity color scheme
        geoff: {
          bg: '#000000',
          surface: '#0a0a0a',
          card: '#111111',
          border: '#1a1a1a',
          'border-light': '#2a2a2a',
          text: '#e8e8e8',
          'text-muted': '#888888',
          'text-dim': '#555555',
          accent: '#0057ff',
          'accent-hover': '#0066ff',
          'accent-dim': 'rgba(0, 87, 255, 0.15)',
          success: '#00c853',
          'success-dim': 'rgba(0, 200, 83, 0.15)',
          warning: '#ff9800',
          'warning-dim': 'rgba(255, 152, 0, 0.15)',
          error: '#ff3d3d',
          'error-dim': 'rgba(255, 61, 61, 0.15)',
          purple: '#8b5cf6',
          'purple-dim': 'rgba(139, 92, 246, 0.15)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}
