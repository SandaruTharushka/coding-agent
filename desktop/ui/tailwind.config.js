/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Claude Code interface color palette
        cc: {
          bg:         '#0a0a0a', // main background
          sidebar:    '#141414', // sidebar / right panel
          surface:    '#1a1a1a', // cards, panels
          surface2:   '#222222', // elevated surface
          border:     '#2a2a2a', // standard borders
          border2:    '#333333', // lighter borders
          text:       '#f0f0f0', // primary text
          muted:      '#888888', // secondary / muted text
          subtle:     '#4a4a4a', // very subtle text / inactive
          accent:     '#d77757', // Claude orange (brand)
          'accent-bg': '#1f1410', // orange-tinted surface
          merged:     '#a855f7', // purple for merged / PR states
          success:    '#4ade80', // green success
          'success-bg': '#0d1f12',
          error:      '#ef4444', // red error
          'error-bg': '#1f0d0d',
          warning:    '#f59e0b', // amber warning
          'warning-bg': '#1f1600',
          blue:       '#60a5fa', // blue accent (running)
          'blue-bg':  '#0d1425',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
