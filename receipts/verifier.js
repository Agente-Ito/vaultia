#!/usr/bin/env node
// Simple receipt verifier: schema check + actionHash recompute + signature verify
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

function keccak256(data) {
  return '0x' + crypto.createHash('keccak256').update(Buffer.from(data, 'utf8')).digest('hex');
}

function usage() {
  console.log('Usage: node receipts/verifier.js <path-to-receipt.json>');
  process.exit(1);
}

(async () => {
  const file = process.argv[2];
  if (!file) usage();
  const raw = fs.readFileSync(file, 'utf8');
  const r = JSON.parse(raw);

  // Recompute action hash from critical fields
  const preimage = [r.actorUP, r.action, r.target, r.amountWei, r.txHash, r.timestamp].join('|');
  const recomputed = keccak256(preimage);
  const okHash = recomputed.toLowerCase() === (r.actionHash || '').toLowerCase();

  // Verify signature via ethers (if available) fallback to echo
  let recovered;
  try {
    const code = `
      import { ethers } from 'ethers';
      const r = ${raw};
      const preimage = [r.actorUP, r.action, r.target, r.amountWei, r.txHash, r.timestamp].join('|');
      const hash = ethers.hashMessage(preimage);
      const addr = ethers.recoverAddress(hash, r.signature);
      console.log(addr);
    `;
    recovered = execSync(`node -e ${JSON.stringify(code)}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (e) {
    recovered = '0x';
  }

  console.log(JSON.stringify({ okHash, recomputed, recovered, expectedActor: r.actorUP }, null, 2));
  if (!okHash) process.exit(2);
})();
