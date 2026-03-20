import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Granular Sky dark palette ─────────────────────────────────────────
        granular: {
          'deep-space':  '#05070A',
          'void-blue':   '#0B0F1A',
          navy:          '#0B1020',
          'card-dark':   '#121A2F',
          'card-mid':    '#1A2747',
          violet:        '#7B61FF',
          plasma:        '#3CF2FF',
          nebula:        '#A78BFA',
          'accent-blue': '#6EA8FE',
          'sky-blue':    '#8CC8FF',
          'text-light':  '#EAF2FF',
          success:       '#22FFB2',
          blocked:       '#FF4D6D',
          warning:       '#FFC857',
        },
        // ── Sky light palette ─────────────────────────────────────────────────
        sky: {
          bg:      '#F5F9FF',
          card:    '#FFFFFF',
          primary: '#3F7DFF',
          accent:  '#6EA8FE',
          text:    '#0F172A',
          muted:   '#475569',
        },
        // Financial OS primary colors
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9', // Primary
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c3d66',
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#10b981', // Success
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b', // Warning
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444', // Danger
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        neutral: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      spacing: {
        xs: '0.5rem',   // 8px
        sm: '1rem',     // 16px
        md: '1.5rem',   // 24px
        lg: '2rem',     // 32px
        xl: '3rem',     // 48px
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      borderRadius: {
        sm: '0.375rem',
        base: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.1)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.15)',
        'card-focus': '0 0 0 3px rgba(14, 165, 233, 0.1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
    },
  },
  plugins: [forms],
};

export default config;
