/**
 * errorMap.ts — Decodes on-chain revert reasons into user-friendly strings.
 *
 * Handles:
 *  - Custom errors (4-byte selector lookup table from LUKSO LSP6 + AVP contracts)
 *  - require()/revert() string reasons
 *  - Wagmi/viem ContractFunctionRevertedError format
 *  - Generic fallback
 *
 * Usage:
 *   import { decodeRevertReason } from '@/lib/errorMap';
 *   const msg = decodeRevertReason(caughtError);   // show to user
 */

/**
 * Known 4-byte custom error selectors.
 * Source: LSP6Errors.sol (@lukso/lsp6-contracts) + TemplateFactory.sol (AVP)
 * Keep in sync with scripts/lsp6Keys.ts KNOWN_SELECTORS.
 */
const SELECTOR_MAP: Record<string, string> = {
  // LSP6 KeyManager
  '0x82507c0e': 'Not authorised — the controller is missing a required permission',
  '0x3621bbcc': 'No permissions set for this controller address',
  '0x59bbd7a8': 'Call not allowed — target address is not on the AllowedCalls list',
  '0xa84f2360': 'No calls allowed — the AllowedCalls list is empty for this controller',
  '0x6f855b54': 'Invalid AllowedCalls encoding in storage',
  '0x5c4e99d6': 'Whitelisted call is invalid or misconfigured',
  '0x8e7cc7e8': 'Calling the KeyManager contract itself is not permitted',
  // LSP14 / Ownable
  '0xbf1169c5': 'Only the current owner can perform this action',
  '0x451e4528': 'Only the pending owner can accept ownership',
  // LSP17 extensions
  '0x06d5b17d': 'No extension found for this function selector',
  // AVP TemplateFactory
  '0x4b6d3d25': 'Unknown vault template ID',
};

/**
 * Known require() reason strings → user-friendly messages.
 * Keys are the exact strings from contract require() calls.
 */
const REASON_MAP: Record<string, string> = {
  'AS: must call via KeyManager':        'Access denied — this action must be called through the vault KeyManager',
  'AS: KM not set':                      'KeyManager is not configured for this vault',
  'AS: PE not set':                      'PolicyEngine is not configured for this vault',
  'AS: PE already set':                  'PolicyEngine is already set and cannot be changed',
  'AS: KM already set':                  'KeyManager is already set and cannot be changed',
  'AS: insufficient LYX balance':        'Insufficient LYX balance in the vault',
  'AS: insufficient token balance':      'Insufficient token balance in the vault',
  'PE: only safe':                       'PolicyEngine can only be called by its linked AgentSafe',
  'BP: budget exceeded':                 'Payment exceeds the remaining period budget',
  'BP: budget must be > 0':              'Budget must be greater than 0',
  'BP: token mismatch':                  "Token address doesn't match this vault's budget token",
  'MP: merchant not allowed':            'Recipient is not on the approved merchant whitelist',
  'EP: expired':                         'This vault has expired — payments are no longer allowed',
  'Registry: too many agents':           'Too many agents (maximum 20 per vault)',
  'Registry: too many merchants':        'Too many merchants (maximum 100 per batch)',
  'Registry: caller not authorized':     'Caller is not authorized to deploy vaults on behalf of others',
  'Registry: expiration in the past':    'Expiration timestamp must be in the future',
  'Registry: super permissions disabled':           'SUPER permissions are not allowed — set allowSuperPermissions to enable them',
  'Registry: AllowedCalls required for CALL permission': 'AllowedCalls list is required when using CALL permission without SUPER mode',
  'Registry: allowedCallsByAgent length mismatch':  'Number of AllowedCalls entries must match the number of agents',
  'Ownable: caller is not the owner':    'Only the vault owner can perform this action',
};
const MESSAGE_KEY_MAP: Record<string, string> = {
  'Unknown error': 'errors.unknown',
  'Transaction cancelled by user': 'errors.transaction_cancelled',
  'Only the current owner can perform this action': 'errors.owner_only',
  'Only the pending owner can accept ownership': 'errors.pending_owner_only',
  'Access denied — this action must be called through the vault KeyManager': 'errors.via_key_manager',
  'KeyManager is not configured for this vault': 'errors.km_not_set',
  'PolicyEngine is not configured for this vault': 'errors.pe_not_set',
  'PolicyEngine is already set and cannot be changed': 'errors.pe_already_set',
  'KeyManager is already set and cannot be changed': 'errors.km_already_set',
  'Insufficient LYX balance in the vault': 'errors.insufficient_lyx',
  'Insufficient token balance in the vault': 'errors.insufficient_token',
  'Not authorised — the controller is missing a required permission': 'errors.controller_missing_permission',
  'No permissions set for this controller address': 'errors.no_permissions',
  'Call not allowed — target address is not on the AllowedCalls list': 'errors.call_not_allowed',
  'No calls allowed — the AllowedCalls list is empty for this controller': 'errors.allowed_calls_empty',
  'Invalid AllowedCalls encoding in storage': 'errors.allowed_calls_invalid',
  'Whitelisted call is invalid or misconfigured': 'errors.whitelisted_call_invalid',
  'Calling the KeyManager contract itself is not permitted': 'errors.km_self_call_forbidden',
  'No extension found for this function selector': 'errors.no_extension_found',
  'Unknown vault template ID': 'errors.unknown_template_id',
  'Payment exceeds the remaining period budget': 'errors.budget_exceeded',
  'Budget must be greater than 0': 'errors.budget_gt_zero',
  "Token address doesn't match this vault's budget token": 'errors.token_mismatch',
  'Recipient is not on the approved merchant whitelist': 'errors.merchant_not_allowed',
  'This vault has expired — payments are no longer allowed': 'errors.expired',
  'Only the vault owner can perform this action': 'errors.owner_required',
};

type TranslateFn = (key: string) => string;

function compactMessage(message: string, maxLength = 180): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

/**
 * Decodes a revert error from wagmi/viem/ethers into a user-friendly string.
 *
 * @param error  Any thrown error from a transaction or contract call
 * @returns      Human-readable description suitable for display in the UI
 */
export function decodeRevertReason(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (!(error instanceof Error)) return String(error);

  type ErrorWithExtras = Error & {
    data?: unknown;
    shortMessage?: unknown;
    reason?: unknown;
    error?: { data?: unknown };
    cause?: { data?: unknown };
    code?: unknown;
  };
  const e = error as ErrorWithExtras;

  // viem ContractFunctionRevertedError: exposes decoded error name
  const viemData = e.data as { errorName?: string } | undefined;
  if (viemData?.errorName) {
    return SELECTOR_MAP[viemData.errorName] ?? `Transaction reverted: ${viemData.errorName}`;
  }

  // ethers v6 / wagmi: shortMessage wraps the original reason
  const shortMsg: string | undefined =
    typeof e.shortMessage === 'string' ? e.shortMessage :
    typeof e.reason === 'string' ? e.reason :
    undefined;
  if (typeof shortMsg === 'string' && shortMsg.length > 0) {
    const quotedReasonMatch = shortMsg.match(/execution reverted:\s*"([^"]+)"/i);
    if (quotedReasonMatch) {
      const reason = quotedReasonMatch[1];
      return REASON_MAP[reason] ?? reason;
    }
    // extract require() reason from viem's formatted string
    const reasonMatch = shortMsg.match(/reverted with reason string "([^"]+)"/);
    if (reasonMatch) {
      const reason = reasonMatch[1];
      return REASON_MAP[reason] ?? `Reverted: ${reason}`;
    }
    if (shortMsg.startsWith('The contract function')) {
      return shortMsg.replace(/^The contract function "\w+" reverted\.?\s*/, 'Reverted: ');
    }
    if (shortMsg.includes('reverted')) return shortMsg.slice(0, 300);
  }

  // 4-byte selector in raw error data
  const rawData: string | undefined =
    (typeof e.data === 'string' ? e.data : undefined) ??
    (typeof e.error?.data === 'string' ? e.error.data : undefined) ??
    (typeof e.cause?.data === 'string' ? e.cause.data : undefined);
  if (typeof rawData === 'string' && rawData.startsWith('0x') && rawData.length >= 10) {
    const selector = rawData.slice(0, 10).toLowerCase();
    if (SELECTOR_MAP[selector]) return `Transaction reverted: ${SELECTOR_MAP[selector]}`;
    return `Transaction reverted with an unrecognized error (${selector})`;
  }

  // require() reason buried in the error message string
  const msg = error.message ?? '';
  const requireMatch = msg.match(/reverted with reason string '([^']+)'/);
  if (requireMatch) {
    const reason = requireMatch[1];
    return REASON_MAP[reason] ?? `Reverted: ${reason}`;
  }

  const quotedMessageReasonMatch = msg.match(/execution reverted:\s*"([^"]+)"/i);
  if (quotedMessageReasonMatch) {
    const reason = quotedMessageReasonMatch[1];
    return REASON_MAP[reason] ?? reason;
  }

  // Panic code (e.g. division by zero, array out of bounds)
  const panicMatch = msg.match(/reverted with panic code (\w+)/);
  if (panicMatch) {
    return `Contract panic — invalid operation (code: ${panicMatch[1]})`;
  }

  // User rejected in wallet
  if (
    msg.includes('User rejected') ||
    msg.includes('user rejected') ||
    e.code === 4001
  ) {
    return 'Transaction cancelled by user';
  }

  return `Transaction failed: ${msg.slice(0, 300)}`;
}

export function localizeErrorMessage(message: string, t: TranslateFn): string {
  const normalized = compactMessage(message);
  if (!normalized) return t('errors.unknown');

  if (MESSAGE_KEY_MAP[normalized]) {
    return t(MESSAGE_KEY_MAP[normalized]);
  }

  if (REASON_MAP[normalized] && MESSAGE_KEY_MAP[REASON_MAP[normalized]]) {
    return t(MESSAGE_KEY_MAP[REASON_MAP[normalized]]);
  }

  const failedPrefix = 'Transaction failed: ';
  if (normalized.startsWith(failedPrefix)) {
    return `${t('errors.transaction_failed_prefix')} ${compactMessage(normalized.slice(failedPrefix.length), 120)}`;
  }

  return normalized;
}

export function getLocalizedErrorMessage(error: unknown, t: TranslateFn): string {
  return localizeErrorMessage(decodeRevertReason(error), t);
}

/**
 * Returns true if the error is a user wallet rejection (e.g. MetaMask cancel).
 * Use this to suppress error toasts for expected user cancellations.
 */
export function isUserRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const e = error as Error & { code?: unknown };
  const msg = error.message ?? '';
  return (
    msg.includes('User rejected') ||
    msg.includes('user rejected') ||
    e.code === 4001
  );
}
