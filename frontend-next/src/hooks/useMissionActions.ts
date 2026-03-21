'use client';

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { MissionType } from '@/lib/missions/missionTypes';
import {
  compileMission,
  buildSetDataPayload,
  buildRevokePayload,
  apPermissionsKey,
  getDefaultPolicyConfig,
} from '@/lib/missions/permissionCompiler';
import {
  generateControllerKey,
  encryptKey,
  storeKey,
} from '@/lib/crypto/keyStorage';
import {
  saveMission,
  updateMissionStatus,
  makeMissionId,
  MissionRecord,
} from '@/lib/missions/missionStore';

// ─── ERC725Y + KeyManager minimal ABIs ──────────────────────────────────────

const ERC725Y_ABI = [
  'function getData(bytes32 dataKey) view returns (bytes memory)',
];

const SAFE_WRITE_ABI = [
  'function setDataBatch(bytes32[] memory dataKeys, bytes[] memory dataValues) external',
  'function setData(bytes32 dataKey, bytes memory dataValue) external',
];

const KM_EXECUTE_ABI = [
  'function execute(bytes calldata payload) external payable returns (bytes memory)',
];

const SAFE_INTERFACE = new ethers.Interface(SAFE_WRITE_ABI);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateMissionInput {
  /** Human-readable name for this mission */
  label: string;
  type: MissionType;
  /** Wallet addresses this controller is allowed to call */
  allowedTargets: string[];
  /** Budget in LYX (converted to wei internally) */
  budgetLYX: number;
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  /** Expiration unix timestamp, 0 = no expiry */
  expiration?: number;
  /** Optional per-agent budget list (for PAYROLL / GRANTS) */
  agentBudgets?: Array<{ address: string; budgetLYX: number }>;
  vaultLabel?: string;
}

interface UseMissionActionsState {
  creating: boolean;
  revoking: boolean;
  pausing: boolean;
  error: string | null;
}

interface UseMissionActionsResult extends UseMissionActionsState {
  /**
   * Full mission creation flow:
   *  1. Generate a fresh controller keypair
   *  2. Encrypt it with the passphrase and store in IndexedDB
   *  3. Compile permissions for the mission type
   *  4. Read the current AddressPermissions[] length from the vault
   *  5. Build setData keys/values
   *  6. Owner signs & sends setData via KeyManager
   *  7. Save mission metadata to local store
   */
  createMission: (
    vaultSafe: string,
    keyManagerAddress: string,
    input: CreateMissionInput,
    passphrase: string,
    signer: ethers.Signer
  ) => Promise<MissionRecord | null>;

  /**
   * Revoke a controller by setting its permissions to 0x0 via setData.
   * Owner must sign via KeyManager.
   */
  revokeMission: (
    mission: MissionRecord,
    keyManagerAddress: string,
    signer: ethers.Signer
  ) => Promise<boolean>;

  /**
   * Pause: zero out controller permissions on-chain (key stays in IndexedDB).
   * Resume: restore the permissions bitmap from the mission type.
   * AllowedCalls are preserved on-chain in both cases.
   */
  pauseMission: (
    mission: MissionRecord,
    pause: boolean,
    keyManagerAddress: string,
    signer: ethers.Signer
  ) => Promise<boolean>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMissionActions(): UseMissionActionsResult {
  const [state, setState] = useState<UseMissionActionsState>({
    creating: false,
    revoking: false,
    pausing: false,
    error: null,
  });

  // ── Create ──────────────────────────────────────────────────────────────────
  const createMission = useCallback(
    async (
      vaultSafe: string,
      keyManagerAddress: string,
      input: CreateMissionInput,
      passphrase: string,
      signer: ethers.Signer
    ): Promise<MissionRecord | null> => {
      setState({ creating: true, revoking: false, error: null });
      try {
        // 1. Generate controller keypair
        const { address: controllerAddress, privateKey } = generateControllerKey();

        // 2. Encrypt + persist in IndexedDB
        const blob = await encryptKey(privateKey, passphrase);
        const missionId = makeMissionId(vaultSafe, controllerAddress);
        await storeKey(missionId, blob, controllerAddress);

        // 3. Compile LSP6 permissions
        const compiled = compileMission(input.type, input.allowedTargets);

        // 4. Read current AddressPermissions[] length from vault ERC725Y
        const AP_ARRAY_KEY =
          '0xdf30dba06db6a30e65354d9a64c609861f089545ca58c6b4dbe31a5f338cb0e3';
        const erc725 = new ethers.Contract(vaultSafe, ERC725Y_ABI, signer);
        let existingCount = 0;
        try {
          const raw: string = await erc725.getData(AP_ARRAY_KEY);
          if (raw && raw !== '0x') existingCount = Number(BigInt(raw));
        } catch {
          existingCount = 0;
        }

        // 5. Build setData payload
        const { keys, values } = buildSetDataPayload(
          controllerAddress,
          compiled,
          existingCount
        );

        // 6. Call setDataBatch via KeyManager (KM is the UP owner; controllers use km.execute)
        const payload = SAFE_INTERFACE.encodeFunctionData('setDataBatch', [keys, values]);
        const km = new ethers.Contract(keyManagerAddress, KM_EXECUTE_ABI, signer);
        const tx = await km.execute(payload);
        await tx.wait();

        // 8. Save mission metadata
        const defaultConfig = getDefaultPolicyConfig(input.type);
        void defaultConfig; // used for hints — actual policy deployed separately via vault creation
        const record: MissionRecord = {
          id: missionId,
          label: input.label,
          type: input.type,
          controllerAddress,
          vaultSafe,
          status: 'active',
          createdAt: Date.now(),
          vaultLabel: input.vaultLabel,
        };
        await saveMission(record);

        setState({ creating: false, revoking: false, error: null });
        return record;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ creating: false, revoking: false, error: msg });
        return null;
      }
    },
    []
  );

  // ── Revoke ──────────────────────────────────────────────────────────────────
  const revokeMission = useCallback(
    async (
      mission: MissionRecord,
      keyManagerAddress: string,
      signer: ethers.Signer
    ): Promise<boolean> => {
      setState((s) => ({ ...s, revoking: true, error: null }));
      try {
        const { keys, values } = buildRevokePayload(mission.controllerAddress);
        // Revoke via KeyManager
        const payload = SAFE_INTERFACE.encodeFunctionData('setData', [keys[0], values[0]]);
        const km = new ethers.Contract(keyManagerAddress, KM_EXECUTE_ABI, signer);
        const tx = await km.execute(payload);
        await tx.wait();
        await updateMissionStatus(mission.id, 'revoked');
        setState((s) => ({ ...s, revoking: false }));
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, revoking: false, error: msg }));
        return false;
      }
    },
    []
  );

  // ── Pause / Resume (on-chain) ────────────────────────────────────────────────
  const pauseMission = useCallback(
    async (
      mission: MissionRecord,
      pause: boolean,
      keyManagerAddress: string,
      signer: ethers.Signer
    ): Promise<boolean> => {
      setState((s) => ({ ...s, pausing: true, error: null }));
      try {
        const km = new ethers.Contract(keyManagerAddress, KM_EXECUTE_ABI, signer);
        if (pause) {
          // Zero out the permissions key via KM — controller key becomes inert on-chain
          const { keys, values } = buildRevokePayload(mission.controllerAddress);
          const payload = SAFE_INTERFACE.encodeFunctionData('setData', [keys[0], values[0]]);
          const tx = await km.execute(payload);
          await tx.wait();
        } else {
          // Restore the permissions bitmap from the mission type via KM
          const compiled = compileMission(mission.type as MissionType, []);
          const payload = SAFE_INTERFACE.encodeFunctionData('setData', [
            apPermissionsKey(mission.controllerAddress),
            compiled.permBytes,
          ]);
          const tx = await km.execute(payload);
          await tx.wait();
        }
        await updateMissionStatus(mission.id, pause ? 'paused' : 'active');
        setState((s) => ({ ...s, pausing: false }));
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((s) => ({ ...s, pausing: false, error: msg }));
        return false;
      }
    },
    []
  );

  return { ...state, createMission, revokeMission, pauseMission };
}
