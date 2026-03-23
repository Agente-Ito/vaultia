'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { apPermissionsKey, apAllowedCallsKey } from '@/lib/missions/permissionCompiler';
import { decodeRevertReason } from '@/lib/errorMap';
import { getBaseAgentVaultContract, getBaseSigner } from '@/lib/web3/baseContracts';

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

const SAFE_WRITE_ABI = [
  'function setDataBatch(bytes32[] memory dataKeys, bytes[] memory dataValues) external',
];

const KM_EXECUTE_ABI = [
  'function execute(bytes calldata payload) external payable returns (bytes memory)',
];

const SAFE_INTERFACE = new ethers.Interface(SAFE_WRITE_ABI);

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RemoveAgentLuksoParams {
  chain: 'lukso';
  keyManager: string;
  agentAddress: string;
  signer: ethers.Signer;
}

export interface RemoveAgentBaseParams {
  chain: 'base';
  vaultAddress: string;
  agentAddress: string;
}

export type RemoveAgentParams = RemoveAgentLuksoParams | RemoveAgentBaseParams;

export interface RemoveAgentState {
  removing: boolean;
  success: boolean;
  error: string | null;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useRemoveAgentFromVault() {
  const [state, setState] = useState<RemoveAgentState>({
    removing: false,
    success: false,
    error: null,
  });

  const reset = useCallback(() => {
    setState({ removing: false, success: false, error: null });
  }, []);

  const removeAgent = useCallback(async (params: RemoveAgentParams): Promise<boolean> => {
    setState({ removing: true, success: false, error: null });

    try {
      if (params.chain === 'base') {
        const signer = await getBaseSigner();
        const vault = getBaseAgentVaultContract(params.vaultAddress, signer);
        const tx = await vault.removeAgent(params.agentAddress);
        await tx.wait();
      } else {
        const { keyManager, agentAddress, signer } = params;

        // Zero out both the permissions key and allowed calls key for this agent
        const keys = [apPermissionsKey(agentAddress), apAllowedCallsKey(agentAddress)];
        const values = ['0x', '0x'];

        const payload = SAFE_INTERFACE.encodeFunctionData('setDataBatch', [keys, values]);
        const km = new ethers.Contract(keyManager, KM_EXECUTE_ABI, signer);
        const tx = await km.execute(payload);
        await tx.wait();
      }

      setState({ removing: false, success: true, error: null });
      return true;
    } catch (err: unknown) {
      setState({ removing: false, success: false, error: decodeRevertReason(err) });
      return false;
    }
  }, []);

  return { ...state, removeAgent, reset };
}
