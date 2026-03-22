"use client";

import React, { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/web3/wagmiConfig";
import { useTheme } from "@/context/ThemeContext";

function RainbowKitWithTheme({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();

  const rkTheme = isDark
    ? darkTheme({ accentColor: "#7B61FF", accentColorForeground: "white", borderRadius: "medium" })
    : lightTheme({ accentColor: "#3F7DFF", accentColorForeground: "white", borderRadius: "medium" });

  return (
    <RainbowKitProvider theme={rkTheme}>
      {children}
    </RainbowKitProvider>
  );
}

export function Web3Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitWithTheme>
          {children}
        </RainbowKitWithTheme>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
