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
import { useWeb3 } from '@/context/Web3Context';

export default function BudgetsPage() {
  const { nodes, loading, addNode } = useBudgetPools();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('root');
  const { t } = useI18n();
  const { signer } = useWeb3();

  function findNode(ns: BudgetNode[], id: string): BudgetNode | null {
    for (const n of ns) {
      if (n.id === id) return n;
      if (n.children) { const f = findNode(n.children, id); if (f) return f; }
    }
    return null;
  }
  const selected = findNode(nodes, selectedId);

  const totalSpent  = nodes.reduce((s, n) => s + n.spent, 0);
  const totalBudget = nodes.reduce((s, n) => s + n.total, 0);

  const available = totalBudget - totalSpent;
  const usagePct  = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const usageBarColor = usagePct >= 100 ? 'var(--blocked)' : usagePct >= 85 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('budgets.title')}</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('budgets.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>{t('budgets.new_category')}</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { emoji: '💸', label: t('budgets.summary.spent'),     value: `$${totalSpent.toLocaleString()}`,          color: 'var(--text)' },
          { emoji: '🎯', label: t('budgets.summary.limit'),     value: `$${totalBudget.toLocaleString()}`,         color: 'var(--text)' },
          { emoji: available >= 0 ? '✅' : '🚨', label: t('budgets.summary.available'), value: `$${Math.max(0, available).toLocaleString()}`, color: available >= 0 ? 'var(--success)' : 'var(--blocked)' },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <span className="text-2xl">{s.emoji}</span>
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          </div>
        ))}
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">📊</span>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('budgets.summary.usage')}</p>
            <span className="ml-auto text-lg font-bold" style={{ color: 'var(--text)' }}>{usagePct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--card-mid)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${usagePct}%`, background: usageBarColor }} />
          </div>
        </div>
      </div>

      {/* Tree + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{t('budgets.tree.title')}</CardTitle></CardHeader>
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
                {(() => {
                  const pct      = selected.total > 0 ? Math.min((selected.spent / selected.total) * 100, 100) : 0;
                  const ratio    = selected.total > 0 ? selected.spent / selected.total : 0;
                  const barColor = ratio >= 1 ? 'var(--blocked)' : ratio >= 0.85 ? 'var(--warning)' : 'var(--success)';
                  return (
                    <div className="rounded-lg p-3" style={{ background: 'var(--card-mid)' }}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-semibold" style={{ color: 'var(--text)' }}>${selected.spent.toLocaleString()}</span>
                        <span style={{ color: 'var(--text-muted)' }}>${selected.total.toLocaleString()}</span>
                      </div>
                      <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{Math.round(pct)}% {t('budgets.detail.used')}</p>
                    </div>
                  );
                })()}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>{t('budgets.detail.available')}</span>
                    <span className="font-semibold" style={{ color: selected.total - selected.spent >= 0 ? 'var(--success)' : 'var(--blocked)' }}>
                      ${Math.max(0, selected.total - selected.spent).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--text-muted)' }}>{t('budgets.detail.period')}</span>
                    <span className="font-semibold capitalize" style={{ color: 'var(--text)' }}>{selected.period}</span>
                  </div>
                  {selected.children && (
                    <div className="flex justify-between">
                      <span style={{ color: 'var(--text-muted)' }}>{t('budgets.detail.subcategories')}</span>
                      <span className="font-semibold" style={{ color: 'var(--text)' }}>{selected.children.length}</span>
                    </div>
                  )}
                </div>
                <Button variant="secondary" size="sm" fullWidth onClick={() => setShowCreate(true)}>
                  {t('budgets.detail.add_sub')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('budgets.detail.click_prompt')}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CreateBudgetModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        existingNodes={nodes}
        onSave={(parentId, node) => addNode(parentId, node)}
        signer={signer}
      />
    </div>
  );
}
