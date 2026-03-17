import { useCallback, useEffect, useState } from 'react';
import type { BudgetNode } from '@/components/dashboard/BudgetTreeView';

// ─── Mock data — replace with SharedBudgetPool contract reads ────────────────

const DEFAULT_MOCK: BudgetNode[] = [
  {
    id: 'root',
    label: 'Presupuesto Total',
    emoji: '💰',
    spent: 4872,
    total: 5000,
    period: 'monthly',
    children: [
      {
        id: 'living',
        label: 'Gastos del Hogar',
        emoji: '🏠',
        spent: 2950,
        total: 3500,
        period: 'monthly',
        children: [
          { id: 'food', label: 'Alimentos', emoji: '🛒', spent: 720, total: 800, period: 'monthly' },
          { id: 'housing', label: 'Vivienda', emoji: '🏡', spent: 2230, total: 2700, period: 'monthly' },
        ],
      },
      {
        id: 'investments',
        label: 'Inversiones',
        emoji: '📈',
        spent: 780,
        total: 1500,
        period: 'monthly',
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function flattenNodes(nodes: BudgetNode[]): BudgetNode[] {
  const result: BudgetNode[] = [];
  function walk(n: BudgetNode) {
    result.push(n);
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function addChildToNode(nodes: BudgetNode[], parentId: string, child: BudgetNode): BudgetNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) {
      return { ...n, children: [...(n.children ?? []), child] };
    }
    if (n.children) {
      return { ...n, children: addChildToNode(n.children, parentId, child) };
    }
    return n;
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBudgetPools() {
  const [nodes, setNodes] = useState<BudgetNode[]>([]);
  const [loading, setLoading] = useState(true);

  // TODO: replace with real SharedBudgetPool contract read
  useEffect(() => {
    const timer = setTimeout(() => {
      setNodes(DEFAULT_MOCK);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const addNode = useCallback((parentId: string, newNode: BudgetNode) => {
    setNodes((prev) => {
      if (parentId === '') return [...prev, newNode];
      return addChildToNode(prev, parentId, newNode);
    });
  }, []);

  return { nodes, loading, addNode };
}
