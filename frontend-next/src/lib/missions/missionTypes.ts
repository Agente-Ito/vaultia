// ─── Mission Type Definitions ─────────────────────────────────────────────────
// Each mission preset maps to a specific LSP6 permission profile, policy stack,
// and UX configuration. A "mission" is a product abstraction over one LSP6
// controller keypair assigned to an AgentSafe vault.

export const MISSION_TYPES = [
  'VENDORS',
  'SUBSCRIPTIONS',
  'YIELD',
  'PAYROLL',
  'GRANTS',
  'TREASURY_REBALANCE',
  'TAX_RESERVE',
] as const;

export type MissionType = typeof MISSION_TYPES[number];

export type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'HOURLY' | 'FIVE_MINUTES';

export interface MissionDefaultRules {
  period: Period;
  /** Suggested starting budget in LYX (display only) */
  budgetHint: number;
  /** Whether the wizard should require the user to set a merchant allowlist */
  merchantsRequired: boolean;
  /** Whether the wizard should show an expiration date input */
  expirationRequired: boolean;
  /** Whether a per-recipient budget breakdown is available */
  perRecipientBudget: boolean;
  /** For TAX_RESERVE: enforce single destination wallet in UI */
  singleDestination: boolean;
  /** Minimum liquid reserve field (YIELD, TREASURY_REBALANCE) */
  showLiquidReserve: boolean;
}

export interface MissionPreset {
  type: MissionType;
  emoji: string;
  label: string;
  description: string;
  /** Short label shown in the mission selector card */
  tagline: string;
  riskLabel: string;
  riskLevel: 'low' | 'medium' | 'high';
  /** Human-readable summary of the typical policy rules applied */
  rulesPreview: string[];
  defaultRules: MissionDefaultRules;
  /** Whether this preset is ready for the current beta experience */
  stable: boolean;
  /** Whether this preset is coming soon (disabled, not selectable) */
  comingSoon?: boolean;
}

// ─── LSP6 Permission bits (from AgentMode in LSP6KeyLib.sol) ─────────────────

/** CALL (0x800) | TRANSFERVALUE (0x200) */
export const PERMS_STRICT_PAYMENTS = BigInt('0xA00');
/** CALL | TRANSFERVALUE | EXECUTE_RELAY_CALL (0x400000) */
export const PERMS_SUBSCRIPTIONS = BigInt('0x400A00');
/** CALL | TRANSFERVALUE | STATICCALL (0x2000) */
export const PERMS_TREASURY_BALANCED = BigInt('0x2A00');

/** Map from MissionType to LSP6 permission bitmask */
export const MISSION_PERMISSIONS: Record<MissionType, bigint> = {
  VENDORS:             PERMS_STRICT_PAYMENTS,
  SUBSCRIPTIONS:       PERMS_SUBSCRIPTIONS,
  YIELD:               PERMS_TREASURY_BALANCED,
  PAYROLL:             PERMS_STRICT_PAYMENTS,
  GRANTS:              PERMS_STRICT_PAYMENTS,
  TREASURY_REBALANCE:  PERMS_TREASURY_BALANCED,
  TAX_RESERVE:         PERMS_STRICT_PAYMENTS,
};

// ─── Preset catalogue ─────────────────────────────────────────────────────────

export const MISSION_PRESETS: Record<MissionType, MissionPreset> = {
  VENDORS: {
    type: 'VENDORS',
    emoji: '🏪',
    label: 'Vendors',
    description: 'B2B payments to external providers and services.',
    tagline: 'Pay your suppliers automatically',
    riskLabel: 'Wrong recipient / overpayment',
    riskLevel: 'medium',
    rulesPreview: [
      'Strict allowlist of provider wallets',
      'Per-tx spending limit',
      'Daily budget cap',
    ],
    defaultRules: {
      period: 'DAILY',
      budgetHint: 500,
      merchantsRequired: true,
      expirationRequired: false,
      perRecipientBudget: false,
      singleDestination: false,
      showLiquidReserve: false,
    },
    stable: true,
  },

  SUBSCRIPTIONS: {
    type: 'SUBSCRIPTIONS',
    emoji: '🔄',
    label: 'Subscriptions',
    description: 'SaaS, infra, and API recurring payments.',
    tagline: 'Automate your recurring bills',
    riskLabel: 'Duplicate charges / price drift',
    riskLevel: 'low',
    rulesPreview: [
      'Fixed schedule (monthly)',
      'Amount ceiling per charge',
      'Execution time window',
    ],
    defaultRules: {
      period: 'MONTHLY',
      budgetHint: 200,
      merchantsRequired: true,
      expirationRequired: false,
      perRecipientBudget: false,
      singleDestination: false,
      showLiquidReserve: false,
    },
    stable: true,
  },

  YIELD: {
    type: 'YIELD',
    emoji: '📈',
    label: 'Yield',
    description: 'Move idle capital to approved DeFi protocols and rebalance liquidity.',
    tagline: 'Put idle funds to work',
    riskLabel: 'Strategy / market / smart contract risk',
    riskLevel: 'high',
    rulesPreview: [
      'Protocol allowlist (Aave, etc.)',
      'Min liquid reserve enforced',
      'Max allocation cap',
    ],
    defaultRules: {
      period: 'WEEKLY',
      budgetHint: 1000,
      merchantsRequired: true,
      expirationRequired: false,
      perRecipientBudget: false,
      singleDestination: false,
      showLiquidReserve: true,
    },
    stable: true,
    comingSoon: true,
  },

  PAYROLL: {
    type: 'PAYROLL',
    emoji: '💼',
    label: 'Payroll',
    description: 'Recurring contributor and employee payments on fixed dates.',
    tagline: 'Pay your team on schedule',
    riskLabel: 'Incorrect amounts / missed payments',
    riskLevel: 'medium',
    rulesPreview: [
      'Per-contributor predefined amounts',
      'Monthly execution window',
      'Recipient allowlist',
    ],
    defaultRules: {
      period: 'MONTHLY',
      budgetHint: 5000,
      merchantsRequired: true,
      expirationRequired: false,
      perRecipientBudget: true,
      singleDestination: false,
      showLiquidReserve: false,
    },
    stable: false,
  },

  GRANTS: {
    type: 'GRANTS',
    emoji: '🏆',
    label: 'Grants',
    description: 'Milestone-based disbursements for DAOs and bounty programs.',
    tagline: 'Release funds by milestone',
    riskLabel: 'Premature release / milestone fraud',
    riskLevel: 'medium',
    rulesPreview: [
      'Per-milestone expiration',
      'Grantee wallet allowlist',
      'Manual milestone trigger',
    ],
    defaultRules: {
      period: 'MONTHLY',
      budgetHint: 1000,
      merchantsRequired: true,
      expirationRequired: true,
      perRecipientBudget: true,
      singleDestination: false,
      showLiquidReserve: false,
    },
    stable: false,
  },

  TREASURY_REBALANCE: {
    type: 'TREASURY_REBALANCE',
    emoji: '⚖️',
    label: 'Treasury Rebalance',
    description: 'Move funds between internal buckets (ops / reserve / growth).',
    tagline: 'Keep your treasury balanced',
    riskLabel: 'Misrouted internal transfers',
    riskLevel: 'medium',
    rulesPreview: [
      'Only internal vault addresses allowed',
      'Min liquid reserve enforced',
      'Weekly rebalance cap',
    ],
    defaultRules: {
      period: 'WEEKLY',
      budgetHint: 2000,
      merchantsRequired: true,
      expirationRequired: false,
      perRecipientBudget: false,
      singleDestination: false,
      showLiquidReserve: true,
    },
    stable: false,
  },

  TAX_RESERVE: {
    type: 'TAX_RESERVE',
    emoji: '🧾',
    label: 'Tax Reserve',
    description: 'Auto-set aside a % of incoming funds for compliance and taxes.',
    tagline: 'Never miss a tax deadline',
    riskLabel: 'Insufficient reserve',
    riskLevel: 'low',
    rulesPreview: [
      'Single reserve wallet destination',
      'Fixed % of received funds',
      'Auto-trigger on income events',
    ],
    defaultRules: {
      period: 'MONTHLY',
      budgetHint: 300,
      merchantsRequired: false,
      expirationRequired: false,
      perRecipientBudget: false,
      singleDestination: true,
      showLiquidReserve: false,
    },
    stable: false,
  },
};

export const STABLE_MISSION_TYPES: MissionType[] = MISSION_TYPES.filter(
  (t) => MISSION_PRESETS[t].stable
);
