'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useWeb3 } from '@/context/Web3Context';

/**
 * VaultiaLogo
 *
 * Renders the VAULTIA wordmark with barless "A" glyphs (Λ — open angle /
 * inverted-Lambda shape). Strict rule: the letter A carries no crossbar.
 *
 * The 7-dot matrix can optionally be shown as a companion mark.
 */

// ─── Barless-A glyph ─────────────────────────────────────────────────────────

function BarlessA({
  size = 18,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  const s = size;
  const w = s * 0.65;   // glyph width
  const h = s;          // glyph height
  const stroke = s * 0.108;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'bottom' }}
    >
      {/* Two diagonal strokes meeting at apex — no crossbar */}
      <polyline
        points={`0,${h} ${w / 2},0 ${w},${h}`}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── 7-dot matrix mark ────────────────────────────────────────────────────────

export type DotState = 'inactive' | 'pending' | 'active';

const DOT_COLORS: Record<DotState, string> = {
  inactive: '#EDEDED',
  pending:  '#FFB000',
  active:   '#10B981',
};

/**
 * SevenNodeMark — the 7-dot companion to the VAULTIA wordmark.
 * dots: array of 7 DotState values (index 0 = leftmost).
 */
export function SevenNodeMark({
  dots = Array(7).fill('inactive') as DotState[],
  size = 6,
  gap = 5,
}: {
  dots?: DotState[];
  size?: number;
  gap?: number;
}) {
  const total = 7;
  const w = total * size + (total - 1) * gap;

  return (
    <svg
      width={w}
      height={size}
      viewBox={`0 0 ${w} ${size}`}
      aria-hidden="true"
    >
      {Array.from({ length: total }).map((_, i) => {
        const state: DotState = dots[i] ?? 'inactive';
        const cx = i * (size + gap) + size / 2;
        const cy = size / 2;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={size / 2}
            fill={DOT_COLORS[state]}
          />
        );
      })}
    </svg>
  );
}

// ─── Full wordmark ─────────────────────────────────────────────────────────────

interface VaultiaLogoProps {
  /** Font size base for the wordmark characters (px). */
  size?: number;
  /** Text color. Defaults to currentColor. */
  color?: string;
  /** Whether to render the 7-dot matrix above or below the wordmark. */
  showDots?: boolean;
  dots?: DotState[];
  className?: string;
}

export function VaultiaLogo({
  size = 18,
  color = 'currentColor',
  showDots = false,
  dots,
  className,
}: VaultiaLogoProps) {
  const letterStyle: React.CSSProperties = {
    fontSize: size,
    fontWeight: 300,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color,
    lineHeight: 1,
    display: 'inline-block',
  };

  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {showDots && (
        <SevenNodeMark dots={dots} size={5} gap={4} />
      )}
      {/* Wordmark: V [barless A] U L T I [barless A] */}
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: size * 0.04 }}>
        <span style={letterStyle}>V</span>
        <BarlessA size={size} color={color} />
        <span style={letterStyle}>U L T I</span>
        <BarlessA size={size} color={color} />
      </span>
    </span>
  );
}

// ─── Compact icon-only variant ────────────────────────────────────────────────

/**
 * VaultiaIcon — just the 7-dot matrix, used for favicons and compact marks.
 */
export function VaultiaIcon({
  dots,
  size = 6,
  gap = 4,
}: {
  dots?: DotState[];
  size?: number;
  gap?: number;
}) {
  return <SevenNodeMark dots={dots} size={size} gap={gap} />;
}

export default VaultiaLogo;

// ─── Image-based logo link (uses PNG assets) ──────────────────────────────────

/**
 * VaultiaLogoLink — renders the actual brand PNG (dark/light aware) wrapped in
 * a smart link: /dashboard when a wallet is connected, / otherwise.
 */
export function VaultiaLogoLink({ height = 28 }: { height?: number }) {
  const { isDark } = useTheme();
  const { account } = useWeb3();
  // Both logos are ~6.2:1 after trimming — compute width to maintain ratio
  const width = Math.round(height * 6.2);

  return (
    <Link href={account ? '/dashboard' : '/'} className="flex-shrink-0 flex items-center" aria-label="Vaultia">
      <Image
        src={isDark ? '/logo-white.png' : '/logo-black.png'}
        alt="Vaultia"
        width={width}
        height={height}
        style={{ height, width }}
        priority
        unoptimized
      />
    </Link>
  );
}
