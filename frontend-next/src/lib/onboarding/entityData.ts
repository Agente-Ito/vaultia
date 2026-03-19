// ─── Entity taxonomy for onboarding wizard ────────────────────────────────────
// All user-visible strings are i18n key references resolved via t() in components.

export type EntityType =
  | 'individual'
  | 'business'
  | 'dao'
  | 'creator'
  | 'fund'
  | 'nonprofit';

export interface SubVaultTemplate {
  id: string;
  emoji: string;
  titleKey: string;
  descKey: string;
}

export interface EntityProfile {
  id: string;
  emoji: string;
  titleKey: string;
  descKey: string;
  vaultKey: string;       // i18n key for the default vault name
  subVaults: SubVaultTemplate[];
}

export interface EntityDefinition {
  id: EntityType;
  emoji: string;
  titleKey: string;
  descKey: string;
  profiles: EntityProfile[];
}

// ─── Sub-vault building blocks ────────────────────────────────────────────────

const SV = (id: string, emoji: string): SubVaultTemplate => ({
  id,
  emoji,
  titleKey: `onboarding.subvault.${id}.title`,
  descKey:  `onboarding.subvault.${id}.desc`,
});

const sv = {
  operations: SV('operations',  '⚙️'),
  payroll:    SV('payroll',     '👷'),
  reserve:    SV('reserve',     '🏦'),
  rnd:        SV('rnd',         '🔬'),
  marketing:  SV('marketing',   '📣'),
  grants:     SV('grants',      '🤝'),
  community:  SV('community',   '🌱'),
  grantOps:   SV('grantOps',    '⚙️'),
  protocol:   SV('protocol',    '🔒'),
  dev:        SV('dev',         '💻'),
  security:   SV('security',    '🛡️'),
  daily:      SV('daily',       '🛒'),
  bills:      SV('bills',       '🏡'),
  savings:    SV('savings',     '💎'),
  emergency:  SV('emergency',   '🚨'),
  portfolio:  SV('portfolio',   '📈'),
  yield:      SV('yield',       '🌾'),
  fees:       SV('fees',        '💸'),
  income:     SV('income',      '💰'),
  taxes:      SV('taxes',       '📋'),
  projects:   SV('projects',    '🎯'),
  equipment:  SV('equipment',   '🎛️'),
  programs:   SV('programs',    '📚'),
  donations:  SV('donations',   '🫶'),
  impact:     SV('impact',      '🌍'),
  admin:      SV('admin',       '🗂️'),
  advocacy:   SV('advocacy',    '📢'),
  nft:        SV('nft',         '🖼️'),
  lp:         SV('lp',          '🔄'),
  travel:     SV('travel',      '✈️'),
  healthcare: SV('healthcare',  '🏥'),
};

// ─── Helper to build an entity profile ───────────────────────────────────────

function p(
  id: string,
  emoji: string,
  subVaults: SubVaultTemplate[]
): EntityProfile {
  return {
    id,
    emoji,
    titleKey: `onboarding.profile.${id}.title`,
    descKey:  `onboarding.profile.${id}.desc`,
    vaultKey: `onboarding.profile.${id}.vault`,
    subVaults,
  };
}

// ─── Entity definitions ────────────────────────────────────────────────────────

export const ENTITY_TYPES: EntityDefinition[] = [
  {
    id: 'individual', emoji: '🧑',
    titleKey: 'onboarding.entity.individual.title',
    descKey:  'onboarding.entity.individual.desc',
    profiles: [
      p('household',       '🏠', [sv.daily, sv.bills, sv.savings, sv.emergency, sv.healthcare]),
      p('investor',        '📈', [sv.portfolio, sv.yield, sv.savings, sv.reserve, sv.fees]),
      p('nomad',           '🌐', [sv.daily, sv.travel, sv.income, sv.taxes, sv.emergency]),
    ],
  },
  {
    id: 'business', emoji: '🏢',
    titleKey: 'onboarding.entity.business.title',
    descKey:  'onboarding.entity.business.desc',
    profiles: [
      p('startup',         '🚀', [sv.operations, sv.payroll, sv.rnd, sv.marketing, sv.reserve]),
      p('smb',             '🏪', [sv.operations, sv.payroll, sv.marketing, sv.reserve, sv.taxes]),
      p('defi_protocol',   '⛓️', [sv.protocol, sv.dev, sv.security, sv.grants, sv.marketing]),
    ],
  },
  {
    id: 'dao', emoji: '🏛️',
    titleKey: 'onboarding.entity.dao.title',
    descKey:  'onboarding.entity.dao.desc',
    profiles: [
      p('grants_dao',      '🤝', [sv.grants, sv.grantOps, sv.community, sv.reserve, sv.security]),
      p('dev_dao',         '💻', [sv.dev, sv.payroll, sv.security, sv.operations, sv.reserve]),
      p('community_dao',   '🌱', [sv.community, sv.grants, sv.marketing, sv.operations, sv.reserve]),
    ],
  },
  {
    id: 'creator', emoji: '🎨',
    titleKey: 'onboarding.entity.creator.title',
    descKey:  'onboarding.entity.creator.desc',
    profiles: [
      p('content_creator', '📹', [sv.income, sv.equipment, sv.taxes, sv.savings, sv.marketing]),
      p('freelancer',      '💼', [sv.income, sv.projects, sv.taxes, sv.equipment, sv.reserve]),
      p('artist',          '🖼️', [sv.income, sv.nft, sv.equipment, sv.taxes, sv.savings]),
    ],
  },
  {
    id: 'fund', emoji: '💹',
    titleKey: 'onboarding.entity.fund.title',
    descKey:  'onboarding.entity.fund.desc',
    profiles: [
      p('trading',         '📊', [sv.portfolio, sv.fees, sv.reserve, sv.operations, sv.security]),
      p('yield_fund',      '🌾', [sv.yield, sv.lp, sv.fees, sv.reserve, sv.operations]),
      p('nft_fund',        '🖼️', [sv.nft, sv.fees, sv.reserve, sv.operations, sv.marketing]),
    ],
  },
  {
    id: 'nonprofit', emoji: '🤝',
    titleKey: 'onboarding.entity.nonprofit.title',
    descKey:  'onboarding.entity.nonprofit.desc',
    profiles: [
      p('humanitarian',    '🌍', [sv.donations, sv.impact, sv.operations, sv.admin, sv.reserve]),
      p('advocacy_org',    '📢', [sv.advocacy, sv.programs, sv.operations, sv.admin, sv.reserve]),
      p('research',        '🔬', [sv.grants, sv.rnd, sv.programs, sv.operations, sv.reserve]),
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getEntityDef(id: EntityType): EntityDefinition | undefined {
  return ENTITY_TYPES.find((e) => e.id === id);
}

export function getProfile(entityId: EntityType, profileId: string): EntityProfile | undefined {
  return getEntityDef(entityId)?.profiles.find((p) => p.id === profileId);
}
