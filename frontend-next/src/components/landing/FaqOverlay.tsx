'use client';

import React, { useEffect, useState } from 'react';

// ─── Sub-components ────────────────────────────────────────────────────────────

function SevenDots() {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: 7 }).map((_, i) => (
        <span
          key={i}
          className="block rounded-full"
          style={{
            width: 7,
            height: 7,
            background: 'var(--text)',
            opacity: 0.3 + i * 0.1,
          }}
        />
      ))}
    </div>
  );
}

type FaqItemProps = {
  n: number;
  question: string;
  children: React.ReactNode;
};

function FaqItem(props: FaqItemProps) {
  const { n, question, children } = props;
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-4 py-4 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span
          className="flex-shrink-0 text-xs font-mono leading-5"
          style={{ color: 'var(--accent)', minWidth: '1.5rem' }}
        >
          {String(n).padStart(2, '0')}
        </span>
        <span
          className="flex-1 text-sm font-medium leading-relaxed"
          style={{ color: 'var(--text)' }}
        >
          {question}
        </span>
        <span
          className="flex-shrink-0 text-xs leading-5 transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(45deg)' : 'none',
            display: 'inline-block',
          }}
        >
          +
        </span>
      </button>

      {open && (
        <div
          className="pb-4 pl-10 pr-2 text-sm leading-relaxed space-y-2"
          style={{ color: 'var(--text-muted)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

type HighlightProps = { children: React.ReactNode };

function Highlight(props: HighlightProps) {
  const { children } = props;
  return (
    <span
      className="inline-block text-xs font-medium rounded px-1.5 py-0.5"
      style={{ background: 'var(--card-mid)', color: 'var(--accent)' }}
    >
      {children}
    </span>
  );
}

// ─── Overlay ──────────────────────────────────────────────────────────────────

type FaqOverlayProps = { onClose: () => void };

export function FaqOverlay(props: FaqOverlayProps) {
  const { onClose } = props;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      {/* ── Sticky top bar ── */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}
      >
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          FAQ — Preguntas Frecuentes
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-xs transition-opacity hover:opacity-60"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ✕ <span style={{ letterSpacing: '0.1em' }}>ESC</span>
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 mx-auto w-full max-w-2xl px-6 py-12">
        <SevenDots />

        <h1
          className="text-center mb-10"
          style={{
            fontSize: '1.15rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'var(--text)',
          }}
        >
          Todo lo que necesitas saber
        </h1>

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <FaqItem n={1} question="¿Qué es Vaultia?">
            <p>
              Vaultia es un protocolo de bóvedas programables. Cada bóveda combina un contrato de custodia
              (<Highlight>AgentSafe</Highlight>), un motor de políticas on-chain (<Highlight>PolicyEngine</Highlight>)
              y un gestor de permisos (<Highlight>KeyManager</Highlight> basado en LSP6) para que tú
              decidas con precisión qué puede hacer cada cuenta o agente con tus fondos.
            </p>
          </FaqItem>

          <FaqItem n={2} question="¿Necesito experiencia en blockchain para usarlo?">
            <p>No. La app está diseñada para funcionar en dos niveles:</p>
            <p>
              <strong style={{ color: 'var(--text)' }}>Modo Simple</strong> — interfaz guiada
              con plantillas preestablecidas. No necesitas escribir código ni entender contratos.
            </p>
            <p>
              <strong style={{ color: 'var(--text)' }}>Modo Avanzado</strong> — control total sobre
              políticas, permisos y flujos de automatización para usuarios técnicos o equipos.
            </p>
          </FaqItem>

          <FaqItem n={3} question="¿Qué es una bóveda (Vault)?">
            <p>
              Una bóveda es un contrato inteligente (<Highlight>AgentSafe</Highlight>) que custodia
              activos digitales y ejecuta transacciones solo cuando el motor de políticas las valida.
              La bóveda es tuya: la creas, configuras sus reglas y puedes revocar cualquier acceso
              en cualquier momento.
            </p>
          </FaqItem>

          <FaqItem n={4} question="¿Qué activos puede custodiar?">
            <p>
              Cualquier activo nativo de la red LUKSO: <Highlight>LYX</Highlight> (moneda nativa) y
              tokens estándar <Highlight>LSP7</Highlight> (fungibles). El protocolo está diseñado
              para ser extensible a otros estándares en versiones futuras.
            </p>
          </FaqItem>

          <FaqItem n={5} question="¿Qué es el Motor de Políticas?">
            <p>El <Highlight>PolicyEngine</Highlight> es el conjunto de reglas on-chain que se ejecuta
              antes de aprobar cualquier transacción. Actualmente soporta:</p>
            <p><strong style={{ color: 'var(--text)' }}>AgentBudgetPolicy</strong> — límite de gasto total por agente en un período.</p>
            <p><strong style={{ color: 'var(--text)' }}>RecipientBudgetPolicy</strong> — límite de envío acumulado por destinatario.</p>
          </FaqItem>

          <FaqItem n={6} question="¿Puedo limitar cuánto puede gastar un agente?">
            <p>
              Sí. Con <Highlight>AgentBudgetPolicy</Highlight> defines un presupuesto máximo por período
              (diario, semanal, etc.) para cada cuenta o agente autorizado. Una vez alcanzado el límite,
              las transacciones son rechazadas automáticamente on-chain hasta el siguiente ciclo.
            </p>
          </FaqItem>

          <FaqItem n={7} question="¿Puedo automatizar pagos recurrentes?">
            <p>
              Sí. El módulo de <Highlight>Automatización</Highlight> usa el contrato{' '}
              <Highlight>TaskScheduler</Highlight> para registrar tareas con intervalos configurables
              (horario, diario, semanal). Un keeper las ejecuta automáticamente, siempre dentro de
              las políticas activas de la bóveda.
            </p>
          </FaqItem>

          <FaqItem n={8} question="¿Qué es el Key Manager?">
            <p>
              Es el contrato de permisos basado en el estándar <Highlight>LSP6</Highlight> de LUKSO.
              Controla qué cuentas pueden firmar transacciones en tu bóveda y con qué alcance,
              antes de que lleguen al motor de políticas.
            </p>
          </FaqItem>

          <FaqItem n={9} question="¿Qué pasa si un agente intenta superar su límite?">
            <p>
              La transacción es rechazada on-chain por el <Highlight>PolicyEngine</Highlight>.
              No existe camino para eludirlo: la política se ejecuta directamente en el contrato,
              sin intermediarios ni posibilidad de sobrescritura externa.
            </p>
          </FaqItem>

          <FaqItem n={10} question="¿Puede un agente de IA vaciar mi bóveda?">
            <p>
              No. El protocolo bloquea cualquier acción fuera del mandato original definido por el humano.
              El agente no puede vaciar la cuenta ni enviar dinero a direcciones fuera de las configuradas.
            </p>
          </FaqItem>

          <FaqItem n={11} question="¿Es difícil de configurar?">
            <p>No. Ofrecemos dos experiencias de usuario:</p>
            <p>
              <strong style={{ color: 'var(--text)' }}>Modo Simple</strong> — Configura tu primera bóveda
              en solo 5 pasos con plantillas preestablecidas.
            </p>
            <p>
              <strong style={{ color: 'var(--text)' }}>Modo Avanzado</strong> — Accede a la flexibilidad
              total del protocolo para diseñar flujos financieros y permisos complejos.
            </p>
          </FaqItem>
        </div>

        {/* ── Bottom close ── */}
        <div className="mt-12 flex justify-center">
          <button
            onClick={onClose}
            className="text-xs transition-opacity hover:opacity-60"
            style={{
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              letterSpacing: '0.1em',
            }}
          >
            ← Volver a Vaultia
          </button>
        </div>
      </div>
    </div>
  );
}
