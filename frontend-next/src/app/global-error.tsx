'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          fontFamily: 'var(--font-geist-sans, sans-serif)',
          background: '#f6f7f9',
          color: '#111827',
        }}
      >
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <section
            style={{
              width: '100%',
              maxWidth: '720px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '20px',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
              padding: '28px',
            }}
          >
            <p
              style={{
                margin: 0,
                color: '#b45309',
                fontSize: '12px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Vaultia runtime error
            </p>
            <h1
              style={{
                margin: '10px 0 12px',
                fontSize: '28px',
                lineHeight: 1.2,
              }}
            >
              Client-side exception
            </h1>
            <p
              style={{
                margin: 0,
                color: '#4b5563',
                lineHeight: 1.7,
              }}
            >
              The app hit an unexpected error while rendering or handling an interaction.
              This screen is intentionally verbose so the production deploy reveals the exact
              message instead of Vercel&apos;s generic fallback.
            </p>

            <div
              style={{
                marginTop: '20px',
                padding: '16px',
                borderRadius: '14px',
                background: '#111827',
                color: '#f9fafb',
                overflowX: 'auto',
              }}
            >
              <p style={{ margin: 0, fontSize: '12px', opacity: 0.7 }}>Message</p>
              <pre
                style={{
                  margin: '8px 0 0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '13px',
                  lineHeight: 1.6,
                }}
              >
                {error.message || 'Unknown client-side exception'}
              </pre>
            </div>

            {error.digest && (
              <p
                style={{
                  margin: '14px 0 0',
                  fontSize: '12px',
                  color: '#6b7280',
                  fontFamily: 'var(--font-geist-mono, monospace)',
                }}
              >
                Digest: {error.digest}
              </p>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '22px', flexWrap: 'wrap' }}>
              <button
                onClick={reset}
                style={{
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  background: '#111827',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.assign('/')}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  background: '#ffffff',
                  color: '#111827',
                  cursor: 'pointer',
                  fontSize: '13px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Go home
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}