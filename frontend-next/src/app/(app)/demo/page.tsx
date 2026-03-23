'use client';
import React from 'react';

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-2xl font-bold">Vaultia — Demo</h1>
      <div className="aspect-video w-full rounded-xl overflow-hidden border" style={{borderColor:'var(--border)'}}>
        <iframe
          className="w-full h-full"
          src="https://www.youtube.com/embed/Qiq8o98aRo8"
          title="Vaultia Demo"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="text-sm space-y-2">
        <p>What you will see:</p>
        <ul className="list-disc ml-5">
          <li>Policy-gated on-chain payment via Universal Profile + KeyManager</li>
          <li>Trusted/Private execution with least-privilege LSP6 permissions</li>
          <li>Verifiable receipt and /verify flow</li>
        </ul>
        <p>
          Verify a receipt here: <a className="text-blue-600 underline" href="/verify">/verify</a>
        </p>
      </div>
    </div>
  );
}
