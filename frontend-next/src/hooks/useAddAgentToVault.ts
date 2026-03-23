'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { compileMission } from '@/lib/missions/permissionCompiler';
import { buildSetDataPayload } from '@/lib/missions/permissionCompiler';
import type { MissionType } from '@/lib/missions/missionTypes';
import { decodeRevertReason } from '@/lib/errorMap';
import { getBaseAgentVaultContract, getBaseSigner } from '@/lib/web3/baseContracts';

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

const ERC725Y_ABI = [
  'function getData(bytes32 dataKey) view returns (bytes memory)',
];

const SAFE_WRITE_ABI = [
  'function setDataBatch(bytes32[] memory dataKeys, bytes[] memory dataValues) external',
];

const KM_EXECUTE_ABI = [
  'function execute(bytes calldata payload) external payable returns (bytes memory)',
];

const SAFE_INTERFACE = new ethers.Interface(SAFE_WRITE_ABI);
const AP_ARRAY_KEY =
  '0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentMode = 'pay_people' | 'pay_vendors' | 'save_funds';

export interface AddAgentLuksoParams {
  chain: 'lukso';
  vaultSafe: string;         // UP / AgentSafe address
  keyManager: string;        // LSP6 KeyManager address
  agentAddress: string;
  mode: AgentMode;
  signer: ethers.Signer;
}

export interface AddAgentBaseParams {
  chain: 'base';
  vaultAddress: string;      // BaseAgentVault address
  agentAddress: string;
}

export type AddAgentParams = AddAgentLuksoParams | AddAgentBaseParams;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export interface AddAgentState {
  adding: boolean;
  success: boolean;
  error: string | null;
}

export function useAddAgentToVault() {
  const [state, setState] = useState<AddAgentState>({
    adding: false,
    success: false,
    error: null,
  });

  const reset = useCallback(() => {
    setState({ adding: false, success: false, error: null });
  }, []);

  const addAgent = useCallback(async (params: AddAgentParams): Promise<boolean> => {
    setState({ adding: true, success: false, error: null });

    try {
      if (params.chain === 'base') {
        // ── Base: call vault.addAgent(address) ─────────────────────────────
        const signer = await getBaseSigner();
        const vault = getBaseAgentVaultContract(params.vaultAddress, signer);
        const tx = await vault.addAgent(params.agentAddress);
        await tx.wait();

      } else {
        // ── LUKSO: grant LSP6 permissions via KeyManager ────────────────────
        const { vaultSafe, keyManager, agentAddress, mode, signer } = params;

        // Map AgentMode → MissionType for permission compilation
        const missionTypeMap: Record<AgentMode, MissionType> = {
          pay_people: 'VENDORS',
          pay_vendors: 'SUBSCRIPTIONS',
          save_funds:  'TREASURY_REBALANCE',
        };
        const compiled = compileMission(missionTypeMap[mode], []);

        // Read current AddressPermissions[] length from vault ERC725Y storage
        const erc725 = new ethers.Contract(vaultSafe, ERC725Y_ABI, signer);
        let existingCount = 0;
        try {
          const raw: string = await erc725.getData(AP_ARRAY_KEY);
          if (raw && raw !== '0x') existingCount = Number(BigInt(raw));
        } catch {
          existingCount = 0;
        }

        // Build ERC725Y setData payload for the agent address
        const { keys, values } = buildSetDataPayload(agentAddress, compiled, existingCount);

        // Call setDataBatch via KeyManager
        const payload = SAFE_INTERFACE.encodeFunctionData('setDataBatch', [keys, values]);
        const km = new ethers.Contract(keyManager, KM_EXECUTE_ABI, signer);
        const tx = await km.execute(payload);
        await tx.wait();
      }

      setState({ adding: false, success: true, error: null });
      return true;
    } catch (err: unknown) {
      setState({ adding: false, success: false, error: decodeRevertReason(err) });
      return false;
    }
  }, []);

  return { ...state, addAgent, reset };
}
