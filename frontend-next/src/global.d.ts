// LUKSO UP Browser Extension injects window.lukso (EIP-1193 provider)
interface Window {
  lukso?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
    isUniversalProfileExtension?: boolean;
  };
}
