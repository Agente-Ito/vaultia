'use client';
import React, { useState } from 'react';
import { ethers } from 'ethers';

type Receipt = {
  receiptId: string;
  actorUP: string;
  action: string;
  target: string;
  amountWei: string;
  txHash: string;
  timestamp: number;
  policy: { maxAmountWei: string; expirySec: number; allowedTargets: string[] };
  actionHash: string;
  signature: string;
};

export default function VerifyPage() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const r: Receipt = JSON.parse(text);
      // recompute actionHash
      const preimage = [r.actorUP, r.action, r.target, r.amountWei, r.txHash, String(r.timestamp)].join('|');
      const recomputed = ethers.keccak256(ethers.toUtf8Bytes(preimage));
      const okHash = recomputed.toLowerCase() === (r.actionHash || '').toLowerCase();
      // verify signature if present
      let recovered = '';
      let okSig = false;
      if (r.signature && r.signature !== '0x') {
        try {
          const hash = ethers.hashMessage(preimage);
          recovered = ethers.recoverAddress(hash, r.signature);
          okSig = recovered.toLowerCase() === r.actorUP.toLowerCase();
        } catch (e) {
          recovered = 'error';
        }
      }
      setResult({ okHash, recomputed, recovered, okSig, expectedActor: r.actorUP, receiptId: r.receiptId, txHash: r.txHash });
    } catch (e: any) {
      setError(e?.message || 'Failed to parse/verify receipt');
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold mb-4">Verify Receipt</h1>
      <p className="mb-4 text-sm text-gray-500">Upload a JSON receipt matching receipts/schema.json to verify its hash and signature.</p>
      <input type="file" accept="application/json" onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
      }} />
      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}
      {result && (
        <div className="mt-6 space-y-2 text-sm">
          <div><span className="font-semibold">Hash valid:</span> {String(result.okHash)}</div>
          <div><span className="font-semibold">Recomputed:</span> {result.recomputed}</div>
          <div><span className="font-semibold">Recovered signer:</span> {result.recovered}</div>
          <div><span className="font-semibold">Signature matches actorUP:</span> {String(result.okSig)}</div>
          <div><span className="font-semibold">Expected actorUP:</span> {result.expectedActor}</div>
          <div><span className="font-semibold">Receipt ID:</span> {result.receiptId}</div>
          <div><span className="font-semibold">Tx hash:</span> <a className="text-blue-600 underline" href={`https://explorer.testnet.lukso.network/tx/${result.txHash}`} target="_blank" rel="noreferrer">{result.txHash}</a></div>
        </div>
      )}
      <div className="mt-8">
        <a className="text-blue-600 underline" href="/api/verified-runs">View Verified Runs API</a>
      </div>
    </div>
  );
}
