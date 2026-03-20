'use client';

import React, { useState } from 'react';
import { useI18n } from '@/context/I18nContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType   = 'wallet' | 'space' | 'agent' | 'recipient';
type EdgeStatus = 'active' | 'blocked' | 'pending';

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  status: EdgeStatus;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  status: EdgeStatus;
}

interface SpaceData {
  label: string;
  agentLabel?: string;
  recipients?: string[];
  status: EdgeStatus;
}

interface PermissionGraphProps {
  spaces?: SpaceData[];   // populated from real vault data
  className?: string;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

const EDGE_COLOR: Record<EdgeStatus, string> = {
  active:  'var(--success)',
  blocked: 'var(--blocked)',
  pending: 'var(--warning)',
};

const STROKE_DASH: Record<EdgeStatus, string> = {
  active:  'none',
  blocked: '6 4',
  pending: '3 4',
};

function buildGraph(spaces: SpaceData[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const CX = 260, CY = 190;   // wallet center

  // Wallet (center)
  nodes.push({ id: 'wallet', label: 'Wallet', type: 'wallet', status: 'active', x: CX, y: CY });

  const count = spaces.length;

  spaces.forEach((space, si) => {
    const angle  = (2 * Math.PI * si) / count - Math.PI / 2;
    const radius = count <= 2 ? 110 : 130;
    const sx = CX + radius * Math.cos(angle);
    const sy = CY + radius * Math.sin(angle);
    const spaceId = `space-${si}`;

    nodes.push({ id: spaceId, label: space.label, type: 'space', status: space.status, x: sx, y: sy });
    edges.push({ from: 'wallet', to: spaceId, status: space.status });

    // Agent node
    if (space.agentLabel) {
      const agentAngle = angle + 0.55;
      const agentR = 80;
      const ax = sx + agentR * Math.cos(agentAngle);
      const ay = sy + agentR * Math.sin(agentAngle);
      const agentId = `agent-${si}`;
      nodes.push({ id: agentId, label: space.agentLabel, type: 'agent', status: space.status, x: ax, y: ay });
      edges.push({ from: spaceId, to: agentId, status: space.status });
    }

    // Recipient nodes (max 2)
    (space.recipients ?? []).slice(0, 2).forEach((rec, ri) => {
      const recAngle = angle - 0.5 + ri * 0.5;
      const recR = 80;
      const rx = sx + recR * Math.cos(recAngle);
      const ry = sy + recR * Math.sin(recAngle);
      const recId = `rec-${si}-${ri}`;
      nodes.push({ id: recId, label: rec, type: 'recipient', status: space.status, x: rx, y: ry });
      edges.push({ from: spaceId, to: recId, status: space.status });
    });
  });

  return { nodes, edges };
}

// ─── Node renderers ───────────────────────────────────────────────────────────

function WalletNode({ x, y, hovered, onHover }: { x: number; y: number; hovered: boolean; onHover: (v: boolean) => void }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: 'default' }}
       onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <circle r={28} fill="var(--card-mid)" stroke="var(--primary)" strokeWidth={hovered ? 2.5 : 1.5}
              style={{ filter: hovered ? 'drop-shadow(0 0 8px var(--primary))' : undefined, transition: 'all 0.2s' }} />
      {/* Hexagon inner ring */}
      <polygon
        points="0,-14 12,-7 12,7 0,14 -12,7 -12,-7"
        fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.6"
      />
      <text textAnchor="middle" dominantBaseline="middle" fontSize="10"
            fontWeight="600" fill="var(--text)" dy="0">
        ◆
      </text>
    </g>
  );
}

function SpaceNode({ node, hovered, onHover }: { node: GraphNode; hovered: boolean; onHover: (v: boolean) => void }) {
  const color = EDGE_COLOR[node.status];
  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'default' }}
       onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      {node.status === 'active' && (
        <circle r={22} fill="none" stroke={color} strokeWidth="1" opacity="0.3"
                style={{ animation: 'pulse-node 2.5s ease-in-out infinite' }} />
      )}
      <circle r={18} fill="var(--card-mid)" stroke={color} strokeWidth={hovered ? 2 : 1.2}
              style={{ filter: hovered ? `drop-shadow(0 0 6px ${color})` : undefined, transition: 'all 0.2s' }} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fontWeight="500"
            fill="var(--text)" dy="0">
        {node.label.length > 10 ? node.label.slice(0, 9) + '…' : node.label}
      </text>
    </g>
  );
}

function AgentNode({ node, hovered, onHover }: { node: GraphNode; hovered: boolean; onHover: (v: boolean) => void }) {
  const color = EDGE_COLOR[node.status];
  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'default' }}
       onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <circle r={13} fill="var(--card)" stroke={color} strokeWidth={hovered ? 2 : 1}
              strokeDasharray={node.status === 'blocked' ? '4 3' : undefined}
              style={{ transition: 'all 0.2s' }} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="var(--accent)" dy="0">⚡</text>
    </g>
  );
}

function RecipientNode({ node, hovered, onHover }: { node: GraphNode; hovered: boolean; onHover: (v: boolean) => void }) {
  const color = EDGE_COLOR[node.status];
  return (
    <g transform={`translate(${node.x},${node.y})`} style={{ cursor: 'default' }}
       onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}>
      <circle r={10} fill="var(--card)" stroke={color} strokeWidth={hovered ? 1.5 : 0.8}
              style={{ transition: 'all 0.2s' }} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize="6.5" fill="var(--text-muted)" dy="0">
        {node.label.length > 6 ? node.label.slice(0, 5) + '…' : node.label}
      </text>
    </g>
  );
}

// ─── Particle on edge ─────────────────────────────────────────────────────────

function AnimatedEdge({ edge, nodes }: { edge: GraphEdge; nodes: GraphNode[] }) {
  const from = nodes.find((n) => n.id === edge.from);
  const to   = nodes.find((n) => n.id === edge.to);
  if (!from || !to) return null;

  const color = EDGE_COLOR[edge.status];
  const dash  = STROKE_DASH[edge.status];

  // Unique ID for path
  const pathId = `ep-${edge.from}-${edge.to}`.replace(/[^a-zA-Z0-9-]/g, '_');

  return (
    <g>
      <path
        id={pathId}
        d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.4"
        strokeDasharray={dash === 'none' ? undefined : dash}
        fill="none"
      />
      {/* Traveling particle (active edges only) */}
      {edge.status === 'active' && (
        <circle r="2.5" fill={color} opacity="0.9">
          <animateMotion dur={`${2 + Math.random() * 2}s`} repeatCount="indefinite" path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`} />
        </circle>
      )}
    </g>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-4 text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
      {([['active', t('dashboard.status.active')], ['blocked', t('dashboard.status.blocked')], ['pending', t('dashboard.status.paused')]] as const).map(([status, label]) => (
        <div key={status} className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 inline-block rounded" style={{ background: EDGE_COLOR[status] }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Default / demo data ──────────────────────────────────────────────────────

const DEMO_SPACES: SpaceData[] = [
  { label: 'Payments',     agentLabel: 'Vaultia',    recipients: ['Alice', 'Bob'],   status: 'active'  },
  { label: 'Subscriptions', agentLabel: 'Auto',      recipients: ['Netflix'],        status: 'active'  },
  { label: 'Savings',                                 recipients: ['Pool'],           status: 'pending' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function PermissionGraph({ spaces, className = '' }: PermissionGraphProps) {
  const { t } = useI18n();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const effectiveSpaces = (spaces && spaces.length > 0) ? spaces : DEMO_SPACES;
  const isEmpty = !spaces || spaces.length === 0;

  const { nodes, edges } = buildGraph(effectiveSpaces);

  const W = 520, H = 380;

  return (
    <div className={`space-y-3 ${className}`}>
      {isEmpty && (
        <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          {t('dashboard.graph.empty')}
        </p>
      )}

      <div
        className="relative w-full rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height="100%"
          style={{ display: 'block', minHeight: 220 }}
          aria-label={t('dashboard.graph.title')}
        >
          {/* Background grid dots */}
          <defs>
            <pattern id="pgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="0.8" fill="var(--border)" opacity="0.6" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#pgrid)" />

          {/* Edges (rendered below nodes) */}
          {edges.map((e, i) => (
            <AnimatedEdge key={i} edge={e} nodes={nodes} />
          ))}

          {/* Nodes */}
          {nodes.map((node) => {
            const hovered = hoveredId === node.id;
            const setHover = (v: boolean) => setHoveredId(v ? node.id : null);
            if (node.type === 'wallet')    return <WalletNode    key={node.id} x={node.x} y={node.y} hovered={hovered} onHover={setHover} />;
            if (node.type === 'space')     return <SpaceNode     key={node.id} node={node} hovered={hovered} onHover={setHover} />;
            if (node.type === 'agent')     return <AgentNode     key={node.id} node={node} hovered={hovered} onHover={setHover} />;
            if (node.type === 'recipient') return <RecipientNode key={node.id} node={node} hovered={hovered} onHover={setHover} />;
            return null;
          })}

          {/* Wallet label */}
          {(() => {
            const w = nodes.find((n) => n.id === 'wallet');
            if (!w) return null;
            return (
              <text x={w.x} y={w.y + 42} textAnchor="middle" fontSize="9" fontWeight="600"
                    fill="var(--text-muted)">{t('dashboard.graph.wallet')}</text>
            );
          })()}
        </svg>
      </div>

      <Legend />
    </div>
  );
}
