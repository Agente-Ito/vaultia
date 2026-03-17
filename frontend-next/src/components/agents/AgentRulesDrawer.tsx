'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils/cn';
import type { AgentRecord } from './types';

interface AgentRulesDrawerProps {
  agent: AgentRecord | null;
  open: boolean;
  onClose: () => void;
  onSave: (updated: AgentRecord) => void;
}

function MerchantChip({ address, onRemove }: { address: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-1 rounded-full">
      {address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address}
      <button
        onClick={onRemove}
        className="text-neutral-400 hover:text-red-400 transition-colors"
        aria-label="Eliminar"
      >×</button>
    </span>
  );
}

export function AgentRulesDrawer({ agent, open, onClose, onSave }: AgentRulesDrawerProps) {
  const [paymentsAllowed, setPaymentsAllowed] = useState(true);
  const [perTxLimit, setPerTxLimit] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [merchants, setMerchants] = useState<string[]>([]);
  const [merchantInput, setMerchantInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [gasLimit, setGasLimit] = useState('');

  useEffect(() => {
    if (!agent) return;
    setPaymentsAllowed(agent.active);
    setPerTxLimit(agent.perTxLimit > 0 ? String(agent.perTxLimit) : '');
    setMonthlyLimit(agent.monthlyLimit > 0 ? String(agent.monthlyLimit) : '');
    setMerchants(agent.merchantWhitelist);
    setGasLimit(agent.maxGasPerCall > 0 ? String(agent.maxGasPerCall) : '');
  }, [agent]);

  if (!agent) return null;

  const addMerchant = () => {
    const raw = merchantInput.trim();
    if (!raw || merchants.includes(raw)) return;
    setMerchants((m) => [...m, raw]);
    setMerchantInput('');
  };

  const handleSave = () => {
    onSave({
      ...agent,
      active: paymentsAllowed,
      perTxLimit: parseFloat(perTxLimit) || 0,
      monthlyLimit: parseFloat(monthlyLimit) || 0,
      merchantWhitelist: merchants,
      maxGasPerCall: parseInt(gasLimit) || 0,
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()} direction="right">
      <SheetContent side="right">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <SheetTitle>Reglas del agente · {agent.name}</SheetTitle>
          <button
            onClick={onClose}
            className="rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
            aria-label="Cerrar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Enable payments */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">Permitir pagos</p>
              <p className="text-xs text-neutral-500">El agente puede ejecutar transacciones</p>
            </div>
            <Switch checked={paymentsAllowed} onCheckedChange={setPaymentsAllowed} />
          </div>

          {/* Per-tx limit */}
          <div>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
              Límite por transacción ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input
                type="number"
                value={perTxLimit}
                onChange={(e) => setPerTxLimit(e.target.value)}
                min="0"
                placeholder="Sin límite"
                className="w-full h-10 rounded-md border border-neutral-300 pl-7 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
              />
            </div>
          </div>

          {/* Monthly limit */}
          <div>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
              Límite mensual ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
              <input
                type="number"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                min="0"
                placeholder="Sin límite"
                className="w-full h-10 rounded-md border border-neutral-300 pl-7 pr-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
              />
            </div>
          </div>

          {/* Merchant whitelist */}
          <div>
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
              Whitelist de merchants
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={merchantInput}
                onChange={(e) => setMerchantInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addMerchant()}
                placeholder="0x... o nombre"
                className="flex-1 h-9 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
              />
              <Button variant="secondary" size="sm" onClick={addMerchant}>
                Agregar
              </Button>
            </div>
            {merchants.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {merchants.map((m) => (
                  <MerchantChip key={m} address={m} onRemove={() => setMerchants((ms) => ms.filter((x) => x !== m))} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">Sin restricciones de merchant (cualquiera permitido)</p>
            )}
          </div>

          {/* Advanced mode */}
          <div>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <svg className={cn('w-3.5 h-3.5 transition-transform', showAdvanced && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Modo Avanzado
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3">
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1">
                    Gas limit por llamada
                  </label>
                  <input
                    type="number"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(e.target.value)}
                    placeholder="0 = sin límite"
                    className="w-full h-9 rounded-md border border-neutral-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400 block mb-1">
                    Dirección del contrato
                  </label>
                  <input
                    type="text"
                    defaultValue={agent.address}
                    readOnly
                    className="w-full h-9 rounded-md border border-neutral-200 bg-neutral-50 px-3 text-xs font-mono text-neutral-500 cursor-default dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </div>
              </div>
            )}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="flex-1">
            Guardar cambios
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
