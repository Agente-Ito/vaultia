export interface AgentRecord {
  address: string;
  name: string;
  roles: string[];
  active: boolean;
  perTxLimit: number;
  monthlyLimit: number;
  spentThisPeriod: number;
  vaultCount: number;
  maxGasPerCall: number;
  allowedAutomation: boolean;
  merchantWhitelist: string[];
}
