"use client";

import React, { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/web3/wagmiConfig";
import { DemoProvider } from "@/context/DemoContext";

export function Web3Providers({ children }: { children: React.ReactNode }) {
  // Stable QueryClient — must not be recreated on each render
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#FE005B",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
        >
          <DemoProvider>
            {children}
          </DemoProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
