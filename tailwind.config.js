/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── StrataField Design System (Redesigned with CSS Variables) ────
        sf: {
          void:        'var(--sf-void)',      // Level 0
          base:        'var(--sf-base)',      // Level 1
          surface:     'var(--sf-surface)',   // Level 2
          'surface-2': 'var(--sf-surface-2)', // Level 3
          'surface-3': 'var(--sf-surface-3)', // Level 4
          border:      'var(--sf-border)',
          'border-2':  'var(--sf-border-2)',
        },

        // Primary Accent
        accent: {
          DEFAULT:   'var(--accent)',
          hover:     'var(--accent-hover)',
          muted:     'var(--accent-muted)',
          text:      'var(--accent-text)',
        },

        // Text scale
        txt: {
          primary:   'var(--txt-primary)',
          secondary: 'var(--txt-secondary)',
          muted:     'var(--txt-muted)',
          inverse:   'var(--txt-secondary)', // mapped nicely
        },

        // Status colors
        success:     'var(--success)',
        warning:     'var(--warning)',
        danger:      'var(--danger)',
        info:        'var(--info)',

        // Geological chart colors (preserved from Strata, but can also use defaults)
        geo: {
          clay:         '#8D6E63',
          sand:         '#E0C097',
          kankar:       '#A1887F',
          'clay-kankar':'#6D4C41',
          'sandy-kankar':'#BCAAA4',
          gravel:       '#9E9E9E',
          boulder:      '#757575',
          rock:         '#616161',
        },

        // Pipe colors
        pipe: {
          plain:     'var(--pipe-plain)',
          slotted:   'var(--pipe-slotted)',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xs': ['0.55rem', { lineHeight: '0.75rem' }],
        '4xs': ['0.475rem', { lineHeight: '0.625rem' }],
        '5xs': ['0.4rem', { lineHeight: '0.5rem' }],
      },

      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
      },

      boxShadow: {
        'sf':      '0 1px 3px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.3)',
        'sf-md':   '0 4px 16px rgba(0, 0, 0, 0.5)',
        'sf-lg':   '0 8px 32px rgba(0, 0, 0, 0.6)',
        'sf-glow': '0 0 16px rgba(232, 123, 53, 0.15)',
        'sf-inset':'inset 0 1px 2px rgba(0, 0, 0, 0.3)',
      },

      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-left': 'slideLeft 0.3s ease-out',
        'pulse-accent': 'pulseAccent 2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideLeft: {
          '0%':   { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseAccent: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
      },

      spacing: {
        'sidebar': '260px',
        'topbar':  '48px',
        'statusbar': '28px',
      },
    },
  },
  plugins: [],
};
