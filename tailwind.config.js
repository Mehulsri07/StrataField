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
        // ── StrataField Design System ────────────────────────────────────
        // Deep navy base (ArcGIS Pro / VS Code inspired)
        sf: {
          void:      '#0a0e17',    // deepest background
          base:      '#0f1419',    // main background
          surface:   '#161b22',    // card/panel backgrounds
          'surface-2': '#1c2128',  // elevated surfaces
          'surface-3': '#21262d',  // hover states
          border:    '#30363d',    // borders
          'border-2': '#3d444d',   // prominent borders
        },

        // Primary accent — engineering orange
        accent: {
          DEFAULT:   '#E87B35',    // primary CTA, active states
          hover:     '#F09048',    // hover on primary
          muted:     '#E87B3520',  // backgrounds
          text:      '#FFB070',    // accent text on dark
        },

        // Steel blue accent (structural UI)
        steel: {
          DEFAULT:   '#3B82F6',    // secondary accent
          dark:      '#1D4ED8',    // pressed state
          light:     '#60A5FA',    // text/icons
          muted:     '#3B82F620',  // backgrounds
        },

        // Text scale
        txt: {
          primary:   '#E6EDF3',    // main text
          secondary: '#8B949E',    // secondary text
          muted:     '#484F58',    // muted/disabled text
          inverse:   '#0f1419',    // text on light surfaces
        },

        // Status colors
        success:     '#3FB950',
        warning:     '#D29922',
        danger:      '#F85149',
        info:        '#58A6FF',

        // Geological chart colors (preserved from Strata)
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
          plain:     '#FFFFFF',
          slotted:   '#42A5F5',
        },

        // ── Light theme overrides ──────────────────────────────────────
        light: {
          bg:        '#FFFFFF',
          surface:   '#F6F8FA',
          'surface-2': '#EAEEF2',
          border:    '#D0D7DE',
          'txt-primary': '#1F2328',
          'txt-secondary': '#656D76',
        },
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
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
        'sidebar': '280px',
        'topbar':  '48px',
        'statusbar': '28px',
      },
    },
  },
  plugins: [],
};
