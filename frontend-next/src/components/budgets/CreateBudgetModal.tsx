'use client';

import React, { useState, useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/common/Button';
import { type BudgetNode } from '@/components/dashboard/BudgetTreeView';
import { cn } from '@/lib/utils/cn';

const EMOJIS = ['💰', '🏠', '🛒', '📈', '🎯', '✈️', '🏥', '🎓', '🎵', '⚡', '🍔', '🎮'];

const PERIODS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
] as const;

interface CreateBudgetModalProps {
  open: boolean;
  onClose: () => void;
  existingNodes: BudgetNode[];
  onSave: (parentId: string, node: BudgetNode) => void;
}

function MiniTreePreview({ nodes, highlightId }: { nodes: BudgetNode[]; highlightId?: string }) {
  return (
    <div className="text-xs font-mono space-y-0.5 text-neutral-600 dark:text-neutral-400">
      {nodes.map((n) => <MiniNode key={n.id} node={n} depth={0} highlightId={highlightId} />)}
    </div>
  );
}

function MiniNode({ node, depth, highlightId }: { node: BudgetNode; depth: number; highlightId?: string }) {
  const indent = depth * 12;
  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1',
          node.id === highlightId && 'text-primary-600 dark:text-primary-400 font-semibold'
        )}
        style={{ paddingLeft: `${indent}px` }}
      >
        <span>{depth > 0 ? '└─ ' : ''}</span>
        <span>{node.emoji} {node.label}</span>
        {node.id === highlightId && <span className="text-primary-400">(nuevo)</span>}
      </div>
      {node.children?.map((c) => (
        <MiniNode key={c.id} node={c} depth={depth + 1} highlightId={highlightId} />
      ))}
    </>
  );
}

function flattenForSelect(nodes: BudgetNode[], result: { id: string; label: string; depth: number }[] = [], depth = 0) {
  nodes.forEach((n) => {
    result.push({ id: n.id, label: n.label, depth });
    if (n.children) flattenForSelect(n.children, result, depth + 1);
  });
  return result;
}

export function CreateBudgetModal({ open, onClose, existingNodes, onSave }: CreateBudgetModalProps) {
  const uid = useId();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('💰');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [parentId, setParentId] = useState('root');

  const flatOptions = flattenForSelect(existingNodes);

  const previewId = `preview-${uid}`;
  const previewNode: BudgetNode = {
    id: previewId,
    label: name || 'Nueva categoría',
    emoji,
    spent: 0,
    total: parseFloat(amount) || 0,
    period,
  };

  // Build preview tree with new node inserted
  function insertPreview(nodes: BudgetNode[], pid: string): BudgetNode[] {
    return nodes.map((n) => {
      if (n.id === pid) {
        return { ...n, children: [...(n.children ?? []), previewNode] };
      }
      if (n.children) return { ...n, children: insertPreview(n.children, pid) };
      return n;
    });
  }

  const previewTree = parentId
    ? insertPreview(existingNodes, parentId)
    : [...existingNodes, previewNode];

  const handleSave = () => {
    if (!name.trim() || !amount) return;
    const newNode: BudgetNode = {
      id: `pool-${Date.now()}`,
      label: name.trim(),
      emoji,
      spent: 0,
      total: parseFloat(amount),
      period,
    };
    onSave(parentId, newNode);
    setName(''); setAmount(''); setEmoji('💰'); setParentId('root');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <DialogTitle>Crear nueva categoría de presupuesto</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-neutral-200 dark:divide-neutral-700">
          {/* Form */}
          <div className="p-6 space-y-4">
            {/* Name + emoji */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">Nombre</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Alimentación"
                  className="flex-1 h-10 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
                />
                <div className="relative">
                  <select
                    aria-label="Emoji"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    className="h-10 rounded-md border border-neutral-300 px-2 text-xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700"
                  >
                    {EMOJIS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">Monto mensual</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  placeholder="0"
                  className="w-full h-10 rounded-md border border-neutral-300 pl-7 pr-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
                />
              </div>
            </div>

            {/* Period */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">Período</label>
              <div className="flex gap-2">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg border-2 text-sm font-medium transition-all',
                      period === p.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                        : 'border-neutral-200 text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-400'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parent */}
            <div>
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
                ¿Dentro de qué presupuesto?
              </label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar padre…" />
                </SelectTrigger>
                <SelectContent>
                  {flatOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {'  '.repeat(opt.depth)}{opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live preview */}
          <div className="p-6">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">
              Vista previa del árbol
            </p>
            <div className="bg-neutral-50 dark:bg-neutral-900/50 rounded-lg p-3 overflow-auto max-h-64">
              <MiniTreePreview nodes={previewTree} highlightId={previewId} />
            </div>
            <p className="text-xs text-neutral-400 mt-2">
              Los nodos nuevos aparecerán resaltados una vez creados.
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !amount}>
            Crear categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
