'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils/cn';

export interface BudgetNode {
  id: string;
  label: string;
  emoji: string;
  spent: number;
  total: number;
  period: 'daily' | 'weekly' | 'monthly';
  children?: BudgetNode[];
}

interface BudgetTreeNodeProps {
  node: BudgetNode;
  depth?: number;
  onSelect?: (node: BudgetNode) => void;
  selectedId?: string;
}

function SpendBar({ spent, total, colorClass }: { spent: number; total: number; colorClass: string }) {
  const pct = total > 0 ? Math.min((spent / total) * 100, 100) : 0;
  const isOverBudget = spent > total;
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span className={cn(isOverBudget && 'text-red-500 font-medium')}>
          ${spent.toLocaleString()} gastado
        </span>
        <span>${total.toLocaleString()}</span>
      </div>
    </div>
  );
}

function getBarColor(spent: number, total: number): string {
  if (total <= 0) return 'bg-neutral-300';
  const ratio = spent / total;
  if (ratio >= 1) return 'bg-red-500';
  if (ratio >= 0.85) return 'bg-yellow-400';
  return 'bg-green-500';
}

export function BudgetTreeNode({
  node,
  depth = 0,
  onSelect,
  selectedId,
}: BudgetTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className={cn('select-none', depth > 0 && 'ml-4 border-l border-neutral-200 dark:border-neutral-700 pl-3')}>
      <div
        className={cn(
          'group flex items-start gap-2 rounded-lg p-2.5 cursor-pointer transition-colors',
          isSelected
            ? 'bg-primary-50 dark:bg-neutral-700 ring-1 ring-primary-300 dark:ring-primary-600'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-700/50'
        )}
        onClick={() => {
          onSelect?.(node);
          if (hasChildren) setExpanded((e) => !e);
        }}
      >
        {/* Expand toggle */}
        <button
          className={cn(
            'mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center text-neutral-400 transition-transform',
            hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none',
            expanded && 'rotate-90'
          )}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          aria-label={expanded ? 'Contraer' : 'Expandir'}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Emoji */}
        <span className="text-base flex-shrink-0 mt-0.5">{node.emoji}</span>

        {/* Label + bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn(
              'text-sm font-medium truncate',
              isSelected ? 'text-primary-700 dark:text-primary-300' : 'text-neutral-900 dark:text-neutral-50'
            )}>
              {node.label}
            </span>
            <span className="text-xs text-neutral-400 flex-shrink-0">
              {node.period === 'monthly' ? '/mes' : node.period === 'weekly' ? '/sem' : '/día'}
            </span>
          </div>
          <SpendBar
            spent={node.spent}
            total={node.total}
            colorClass={getBarColor(node.spent, node.total)}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-1">
          {node.children!.map((child) => (
            <BudgetTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Full tree view ───────────────────────────────────────────────────────────

interface BudgetTreeViewProps {
  nodes: BudgetNode[];
  onSelect?: (node: BudgetNode) => void;
  selectedId?: string;
  onAddCategory?: () => void;
}

export function BudgetTreeView({ nodes, onSelect, selectedId, onAddCategory }: BudgetTreeViewProps) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-10 space-y-2">
        <p className="text-2xl">🌱</p>
        <p className="text-sm text-neutral-500">No hay categorías de presupuesto aún.</p>
        {onAddCategory && (
          <button
            onClick={onAddCategory}
            className="text-sm text-primary-500 hover:underline"
          >
            + Crear primera categoría
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <BudgetTreeNode
          key={node.id}
          node={node}
          depth={0}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
      {onAddCategory && (
        <button
          onClick={onAddCategory}
          className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400 hover:text-primary-500 transition-colors px-7 py-1"
        >
          <span>+</span>
          <span>Agregar categoría</span>
        </button>
      )}
    </div>
  );
}
