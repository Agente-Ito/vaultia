import { useCallback, useState } from 'react';
import type { BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { useSubVaults } from '@/hooks/useSubVaults';

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

// ─── Hook — reads real SharedBudgetPool + VaultDirectory when configured ──────

export function useBudgetPools() {
  const { budgetNodes, loading } = useSubVaults();
  const [extraNodes, setExtraNodes] = useState<BudgetNode[]>([]);

  // Merge on-chain nodes with any locally added nodes
  const nodes = [...budgetNodes, ...extraNodes];

  const addNode = useCallback((parentId: string, newNode: BudgetNode) => {
    setExtraNodes((prev) => {
      if (parentId === '') return [...prev, newNode];
      return addChildToNode(prev, parentId, newNode);
    });
  }, []);

  return { nodes, loading, addNode };
}
