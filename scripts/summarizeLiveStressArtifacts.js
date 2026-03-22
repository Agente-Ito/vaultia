#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const RUNS = [
  { id: 'native', label: 'Native LYX vault', file: 'deployments/live-stress-4201.json' },
  { id: 'lsp7', label: 'LSP7 token vault', file: 'deployments/live-stress-lsp7-4201.json' },
];

function readArtifact(relativePath) {
  const absolutePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  return {
    absolutePath,
    relativePath,
    data: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
  };
}

function printRun(run) {
  console.log(`\n${run.label}`);
  console.log(`artifact: ${run.relativePath}`);
  console.log(`safe: ${run.data.safeAddress}`);
  if (run.data.tokenAddress) {
    console.log(`token: ${run.data.tokenAddress}`);
  }
  console.log(`keyManager: ${run.data.keyManagerAddress}`);
  console.log(`policyEngine: ${run.data.policyEngineAddress}`);
  console.log(`successful txs: ${Object.keys(run.data.transactions).length}`);
  Object.entries(run.data.transactions).forEach(([name, tx]) => {
    console.log(`  - ${name}: ${tx.link}`);
  });
  console.log(`static checks: ${Object.keys(run.data.staticChecks).length}`);
  Object.entries(run.data.staticChecks).forEach(([name, check]) => {
    console.log(`  - ${name}: ${check.expectedReason}`);
  });
}

const loadedRuns = RUNS
  .map((run) => {
    const artifact = readArtifact(run.file);
    return artifact ? { ...run, ...artifact } : null;
  })
  .filter(Boolean);

if (loadedRuns.length === 0) {
  console.error('No live stress artifacts found.');
  process.exit(1);
}

console.log('Verified live stress artifacts');
loadedRuns.forEach(printRun);