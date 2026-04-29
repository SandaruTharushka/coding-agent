/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cc: {
          // Ultra-dark backgrounds
          bg0:           '#0b0b0c',
          bg1:           '#0f0f10',
          bg:            '#111111',
          bg3:           '#141416',
          bg4:           '#1c1c1f',
          bg5:           '#2a2a2e',
          // Borders
          border:        '#1f1f22',
          border2:       '#2a2a2e',
          // Text
          text:          '#e6e6e6',
          muted:         '#9a9a9f',
          subtle:        '#4a4a50',
          // Warm orange accents
          accent:        '#ff6a3d',
          accent2:       '#ff7849',
          'accent-dim':  'rgba(255,106,61,0.08)',
          'accent-glow': 'rgba(255,106,61,0.20)',
          // Semantic
          blue:          '#3b82f6',
          'blue-dim':    '#1a3050',
          success:       '#22c55e',
          'success-dim': '#0a1f10',
          error:         '#ef4444',
          'error-dim':   '#1f0a0a',
          warning:       '#f59e0b',
          'warning-dim': '#1f1400',
          purple:        '#a855f7',
          'purple-dim':  '#1a0f2a',
          // Legacy aliases
          sidebar:       '#0f0f10',
          surface:       '#141416',
          surface2:      '#1c1c1f',
          'accent-bg':   'rgba(255,106,61,0.08)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        panel: '16px',
      },
      boxShadow: {
        'orange-glow':    '0 0 24px rgba(255,106,61,0.15)',
        'orange-glow-sm': '0 0 12px rgba(255,106,61,0.10)',
        'orange-ring':    '0 0 0 1.5px rgba(255,106,61,0.35), 0 0 20px rgba(255,106,61,0.10)',
        'blue-glow':      '0 0 20px rgba(59,130,246,0.20)',
        'panel':          '0 4px 32px rgba(0,0,0,0.50)',
        'card':           '0 2px 16px rgba(0,0,0,0.35)',
        'card-hover':     '0 8px 28px rgba(0,0,0,0.45)',
        'input-focus':    '0 0 0 2px rgba(255,106,61,0.20), 0 0 24px rgba(255,106,61,0.08)',
      },
      keyframes: {
        statusPulse: {
          '0%,100%': { opacity: '1', transform: 'scale(1)' },
          '50%':     { opacity: '0.35', transform: 'scale(0.7)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 8px rgba(255,106,61,0.10)' },
          '50%':     { boxShadow: '0 0 24px rgba(255,106,61,0.32)' },
        },
        fadeSlideIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        sparkle: {
          '0%,100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
          '33%':     { transform: 'scale(1.35) rotate(18deg)', opacity: '0.65' },
          '66%':     { transform: 'scale(0.82) rotate(-10deg)', opacity: '0.88' },
        },
        thinking: {
          '0%,100%': { opacity: '0.25' },
          '50%':     { opacity: '1' },
        },
        barShimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'status-pulse':  'statusPulse 1.6s ease-in-out infinite',
        'status-fast':   'statusPulse 0.75s ease-in-out infinite',
        'glow-pulse':    'glowPulse 2.2s ease-in-out infinite',
        'fade-in':       'fadeSlideIn 0.2s ease',
        'sparkle':       'sparkle 3.5s ease-in-out infinite',
        'thinking':      'thinking 1.2s ease-in-out infinite',
        'bar-shimmer':   'barShimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
