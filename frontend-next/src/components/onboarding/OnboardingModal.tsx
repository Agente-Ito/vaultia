'use client';

import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils/cn';
import { useOnboarding, type UseCase } from '@/context/OnboardingContext';

// ─── Step 1: Use-case selection ───────────────────────────────────────────────

const USE_CASES: { id: UseCase; emoji: string; title: string; description: string }[] = [
  {
    id: 'family',
    emoji: '🏠',
    title: 'Presupuesto Familiar',
    description: 'Crea la estructura jerárquica de gastos del hogar automáticamente.',
  },
  {
    id: 'daily',
    emoji: '🛒',
    title: 'Gastos Diarios con Bots',
    description: 'IA pagan supermercado, restaurantes y suscripciones por ti.',
  },
  {
    id: 'defi',
    emoji: '📈',
    title: 'Estrategia DeFi Automática',
    description: 'Rebalanceo y yield cada hora con bots autónomos.',
  },
];

function Step1({ onSelect }: { onSelect: (uc: UseCase) => void }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          ¿Para qué quieres usar tu bóveda inteligente?
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Elige el caso de uso que mejor describe tu situación — podrás ajustarlo después.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => onSelect(uc.id)}
            className="group text-left rounded-xl border-2 border-neutral-200 hover:border-primary-400 hover:bg-primary-50 p-4 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-700 dark:hover:border-primary-500 dark:hover:bg-neutral-700"
          >
            <span className="text-3xl">{uc.emoji}</span>
            <h3 className="mt-2 font-semibold text-neutral-900 dark:text-neutral-50 text-sm">
              {uc.title}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
              {uc.description}
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-primary-500 group-hover:translate-x-0.5 transition-transform">
              Elegir →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Step 2: Vault name + emoji ───────────────────────────────────────────────

const EMOJIS = ['💰', '🏠', '🛒', '📈', '🎯', '✈️', '🏥', '🎓', '🎵', '⚡'];

function Step2() {
  const { vaultName, vaultEmoji, setVaultName, setVaultEmoji } = useOnboarding();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          Nombra tu primera bóveda
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Dale un nombre y un ícono para identificarla fácilmente.
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
            Nombre de la bóveda
          </label>
          <input
            type="text"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder="Ej. Presupuesto Familiar 2026"
            className="w-full h-10 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
            Ícono
          </label>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setVaultEmoji(e)}
                className={cn(
                  'w-10 h-10 rounded-lg border-2 text-xl flex items-center justify-center transition-all',
                  vaultEmoji === e
                    ? 'border-primary-500 bg-primary-50 dark:bg-neutral-700'
                    : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700'
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Root budget ──────────────────────────────────────────────────────

const PERIODS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensual' },
] as const;

function Step3() {
  const { rootBudget, budgetPeriod, setRootBudget, setBudgetPeriod } = useOnboarding();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          Define tu presupuesto raíz
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Este será el límite máximo de toda la jerarquía de gastos.
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-1">
            Monto máximo
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm font-medium">$</span>
            <input
              type="number"
              value={rootBudget}
              onChange={(e) => setRootBudget(e.target.value)}
              min="0"
              step="100"
              className="w-full h-10 rounded-md border border-neutral-300 pl-7 pr-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-50"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300 block mb-2">
            Período de renovación
          </label>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setBudgetPeriod(p.value)}
                className={cn(
                  'flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                  budgetPeriod === p.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-neutral-700 dark:text-primary-300'
                    : 'border-neutral-200 text-neutral-600 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-400'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function Step4() {
  const { vaultEmoji, vaultName, rootBudget, budgetPeriod, useCase } = useOnboarding();
  const ucLabel = USE_CASES.find((u) => u.id === useCase);
  const periodLabel = PERIODS.find((p) => p.value === budgetPeriod)?.label ?? '';
  return (
    <div className="p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="text-5xl">{vaultEmoji}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
          ¡Todo listo!
        </h2>
        <p className="text-sm text-neutral-500">
          Tu bóveda inteligente está configurada y lista para usar.
        </p>
      </div>
      <div className="rounded-xl bg-neutral-50 dark:bg-neutral-700/50 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Caso de uso</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{ucLabel?.title ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Bóveda</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">{vaultName || 'Sin nombre'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Presupuesto raíz</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-50">${rootBudget} / {periodLabel}</span>
        </div>
      </div>
      <p className="text-xs text-neutral-400 text-center">
        Podrás ajustar todos estos valores desde el panel de Presupuestos.
      </p>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Caso de uso',
  'Tu bóveda',
  'Presupuesto',
  'Resumen',
];

export function OnboardingModal() {
  const {
    step, visible, dismissed,
    close, next, back, finish, dismissPermanently,
    setUseCase,
  } = useOnboarding();

  const [neverShow, setNeverShow] = React.useState(false);

  const handleClose = () => {
    if (neverShow) dismissPermanently();
    else close();
  };

  const handleUseCaseSelect = (uc: UseCase) => {
    setUseCase(uc);
    next();
  };

  const progressValue = ((step + 1) / STEP_LABELS.length) * 100;

  if (dismissed) return null;

  return (
    <Dialog open={visible} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-neutral-900 dark:text-neutral-50">💰 Bóvedas IA</span>
          </div>
          <span className="text-xs text-neutral-400 font-medium">
            {step + 1} / {STEP_LABELS.length}
          </span>
        </div>

        {/* Progress */}
        <div className="px-6 pt-3">
          <Progress value={progressValue} className="h-1.5" />
          <div className="flex gap-2 mt-2">
            {STEP_LABELS.map((label, i) => (
              <span
                key={label}
                className={cn(
                  'text-xs flex-1 text-center transition-colors',
                  i <= step ? 'text-primary-500 font-medium' : 'text-neutral-400'
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[280px]">
          {step === 0 && <Step1 onSelect={handleUseCaseSelect} />}
          {step === 1 && <Step2 />}
          {step === 2 && <Step3 />}
          {step === 3 && <Step4 />}
        </div>

        {/* Footer */}
        {step > 0 && (
          <div className="px-6 pb-5 space-y-3">
            {step >= 1 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={neverShow}
                  onChange={(e) => setNeverShow(e.target.checked)}
                  className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                />
                <span className="text-xs text-neutral-500">No mostrar esta guía de nuevo</span>
              </label>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button variant="secondary" size="sm" onClick={back}>
                ← Volver
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose}>
                  Saltar
                </Button>
                {step < STEP_LABELS.length - 1 ? (
                  <Button size="sm" onClick={next}>
                    Siguiente →
                  </Button>
                ) : (
                  <Button size="sm" variant="success" onClick={finish}>
                    ¡Empezar! 🚀
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
