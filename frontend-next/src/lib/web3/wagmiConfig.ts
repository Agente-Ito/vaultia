"use client";

import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  universalProfilesWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { luksoTestnet, luksoMainnet } from "./chains";

type WagmiConfigInstance = ReturnType<typeof createConfig>;

const globalForWagmi = globalThis as typeof globalThis & {
  __avpWagmiConfig?: WagmiConfigInstance;
};

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

const hasWalletConnectProjectId =
  walletConnectProjectId.length > 0 && walletConnectProjectId !== "DEVELOPMENT";

const projectId = hasWalletConnectProjectId
  ? walletConnectProjectId
  : "DEVELOPMENT";

const otherWallets = [metaMaskWallet, coinbaseWallet];

if (hasWalletConnectProjectId) {
  otherWallets.push(rainbowWallet, walletConnectWallet);
}

function buildWagmiConfig(): WagmiConfigInstance {
  const connectors = connectorsForWallets(
    [
      {
        groupName: "LUKSO",
        wallets: [universalProfilesWallet],
      },
      {
        groupName: "Other Wallets",
        wallets: otherWallets,
      },
    ],
    { appName: "AI Financial Operating System", projectId }
  );

  return createConfig({
    connectors,
    chains: [luksoTestnet, luksoMainnet, baseSepolia, base],
    transports: {
      [luksoTestnet.id]: http(),
      [luksoMainnet.id]: http(),
      [baseSepolia.id]: http(),
      [base.id]: http(),
    },
    ssr: true,
  });
}

export const wagmiConfig =
  globalForWagmi.__avpWagmiConfig ??
  (globalForWagmi.__avpWagmiConfig = buildWagmiConfig());
