'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { CreateBudgetModal } from '@/components/budgets/CreateBudgetModal';
import { useBudgetPools } from '@/hooks/useBudgetPools';

export default function BudgetsPage() {
  const { nodes, loading, addNode } = useBudgetPools();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('root');

  function findNode(ns: BudgetNode[], id: string): BudgetNode | null {
    for (const n of ns) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  }
  const selected = findNode(nodes, selectedId);

  const totalSpent = nodes.reduce((s, n) => s + n.spent, 0);
  const totalBudget = nodes.reduce((s, n) => s + n.total, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">Presupuestos</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
            Jerarquía de categorías de gasto con control multinivel
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          + Nueva categoría
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Total gastado</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">${totalSpent.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Límite total</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">${totalBudget.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Disponible</p>
            <p className={`text-2xl font-bold ${totalBudget - totalSpent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              ${Math.max(0, totalBudget - totalSpent).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-neutral-500 mb-1">Uso</p>
            <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
              {totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tree + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Árbol de categorías</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-4/5 ml-6" />
                  <Skeleton className="h-12 w-3/5 ml-12" />
                </div>
              ) : (
                <BudgetTreeView
                  nodes={nodes}
                  selectedId={selectedId}
                  onSelect={(n) => setSelectedId(n.id)}
                  onAddCategory={() => setShowCreate(true)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail */}
        <div>
          {selected ? (
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span>{selected.emoji}</span>
                  <span>{selected.label}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Gastado</span>
                    <span className="font-semibold">${selected.spent.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Límite</span>
                    <span className="font-semibold">${selected.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Disponible</span>
                    <span className={`font-semibold ${selected.total - selected.spent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ${Math.max(0, selected.total - selected.spent).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Período</span>
                    <span className="font-semibold capitalize">{selected.period}</span>
                  </div>
                  {selected.children && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Sub-categorías</span>
                      <span className="font-semibold">{selected.children.length}</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => setShowCreate(true)}
                >
                  + Agregar sub-categoría
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-neutral-400 text-sm">
                Selecciona una categoría para ver detalles
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal */}
      <CreateBudgetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        existingNodes={nodes}
        onSave={(parentId, node) => addNode(parentId, node)}
      />
    </div>
  );
}
