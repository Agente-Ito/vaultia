'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Skeleton } from '@/components/common/Skeleton';
import { BudgetTreeView, type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { CreateBudgetModal } from '@/components/budgets/CreateBudgetModal';
import { useBudgetPools } from '@/hooks/useBudgetPools';
import { useI18n } from '@/context/I18nContext';

export default function BudgetsPage() {
  const { nodes, loading, addNode } = useBudgetPools();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('root');
  const { t } = useI18n();

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
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50">{t('budgets.title')}</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1 text-sm">
            {t('budgets.subtitle')}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          {t('budgets.new_category')}
        </Button>
      </div>

      {/* Summary cards */}
      {(() => {
        const available = totalBudget - totalSpent;
        const usagePct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
        const usageColor = usagePct >= 100 ? 'bg-red-500' : usagePct >= 85 ? 'bg-yellow-400' : 'bg-green-500';
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 flex items-center gap-3">
              <span className="text-2xl">💸</span>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('budgets.summary.spent')}</p>
                <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50">${totalSpent.toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 flex items-center gap-3">
              <span className="text-2xl">🎯</span>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('budgets.summary.limit')}</p>
                <p className="text-xl font-bold text-neutral-900 dark:text-neutral-50">${totalBudget.toLocaleString()}</p>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 flex items-center gap-3">
              <span className="text-2xl">{available >= 0 ? '✅' : '🚨'}</span>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('budgets.summary.available')}</p>
                <p className={`text-xl font-bold ${available >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  ${Math.max(0, available).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">📊</span>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('budgets.summary.usage')}</p>
                <span className="ml-auto text-lg font-bold text-neutral-900 dark:text-neutral-50">{usagePct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usageColor}`} style={{ width: `${usagePct}%` }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tree + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('budgets.tree.title')}</CardTitle>
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
                {/* Visual spend bar */}
                {(() => {
                  const pct = selected.total > 0 ? Math.min((selected.spent / selected.total) * 100, 100) : 0;
                  const ratio = selected.total > 0 ? selected.spent / selected.total : 0;
                  const barColor = ratio >= 1 ? 'bg-red-500' : ratio >= 0.85 ? 'bg-yellow-400' : 'bg-green-500';
                  return (
                    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-700/50 p-3">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                          ${selected.spent.toLocaleString()}
                        </span>
                        <span className="text-neutral-500">${selected.total.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-600 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-neutral-400 mt-1">{Math.round(pct)}% {t('budgets.detail.used')}</p>
                    </div>
                  );
                })()}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('budgets.detail.available')}</span>
                    <span className={`font-semibold ${selected.total - selected.spent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      ${Math.max(0, selected.total - selected.spent).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">{t('budgets.detail.period')}</span>
                    <span className="font-semibold capitalize">{selected.period}</span>
                  </div>
                  {selected.children && (
                    <div className="flex justify-between">
                      <span className="text-neutral-500">{t('budgets.detail.subcategories')}</span>
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
                  {t('budgets.detail.add_sub')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-neutral-400 text-sm">
                {t('budgets.detail.click_prompt')}
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
