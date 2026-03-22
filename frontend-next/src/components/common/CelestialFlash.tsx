'use client';

import React, { useEffect, useState } from 'react';
import { readSessionStorage, writeSessionStorage } from '@/lib/browserStorage';
import { useTheme } from '@/context/ThemeContext';

/**
 * CelestialFlash — Animated splash screen
 *
 * Sequence:
 * 1. 7 dots appear one-by-one in centre (each 45ms → visible by ~315ms).
 * 2. All-green glow pulse once all 7 are visible (~200ms hold).
 * 3. Fade-out overlay (300ms), then unmounts.
 *
 * Total time before main UI is visible: ~315 + 200 + 300 = ~815ms.
 * Only runs once per browser session (sessionStorage flag).
 */

const DOT_INTERVAL_MS = 45;  // ms between each dot appearing
const GLOW_HOLD_MS    = 220; // ms hold after all 7 lit
const FADE_OUT_MS     = 320; // ms for fade-out

const SESSION_FLAG = 'vaultia-splash-shown';

export function CelestialFlash({ onDone }: { onDone?: () => void }) {
  const { isDark } = useTheme();
  const dotActive = isDark ? '#F5F5F5' : '#1D1D1F';
  const dotInactive = isDark ? '#333333' : '#DEDEDE';
  const splashBg = isDark ? '#0F0F0F' : '#F9F9F9';
  const wordmarkColor = isDark ? '#F5F5F5' : '#1D1D1F';

  const [visibleCount, setVisibleCount] = useState(0);
  const [glowPhase, setGlowPhase] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Only show once per session
    if (readSessionStorage(SESSION_FLAG)) {
      onDone?.();
      return;
    }
    writeSessionStorage(SESSION_FLAG, '1');

    setMounted(true);
    let cancelled = false;

    const revealDots = async () => {
      for (let i = 1; i <= 7; i++) {
        await sleep(DOT_INTERVAL_MS);
        if (cancelled) return;
        setVisibleCount(i);
      }
      // All dots visible — glow pulse
      setGlowPhase(true);
      await sleep(GLOW_HOLD_MS);
      if (cancelled) return;
      // Fade out
      setFadingOut(true);
      await sleep(FADE_OUT_MS);
      if (cancelled) return;
      onDone?.();
    };

    revealDots();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        background: splashBg,
        opacity: fadingOut ? 0 : 1,
        transition: fadingOut ? `opacity ${FADE_OUT_MS}ms ease-out` : 'none',
        pointerEvents: fadingOut ? 'none' : 'all',
      }}
    >
      {/* 7-dot matrix */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const isVisible = i < visibleCount;

          return (
            <span
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isVisible ? dotActive : dotInactive,
                boxShadow: 'none',
                opacity: isVisible ? 1 : 0.22,
                transform: isVisible ? 'scale(1)' : 'scale(0.45)',
                transition: `
                  opacity 180ms cubic-bezier(0.34,1.56,0.64,1),
                  transform 180ms cubic-bezier(0.34,1.56,0.64,1),
                  background 200ms ease,
                  box-shadow 200ms ease
                `,
              }}
            />
          );
        })}
      </div>

      {/* Wordmark — appears once all dots are lit */}
      <div
        style={{
          opacity: visibleCount === 7 ? 1 : 0,
          transform: visibleCount === 7 ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 300ms ease, transform 300ms ease',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          color: wordmarkColor,
          fontSize: 13,
          fontWeight: 300,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}
      >
        VΛULTIΛ
      </div>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
