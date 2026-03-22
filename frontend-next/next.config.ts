import path from "path";
import type { NextConfig } from "next";

const requiredEnvVars = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
] as const;

function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missing = requiredEnvVars.filter((name) => {
    const value = process.env[name];
    return !value || !value.trim();
  });

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    [
      "Missing required frontend environment variables for production build:",
      ...missing.map((name) => `- ${name}`),
      "",
      "Set them in .env.local for local builds or in your hosting provider's environment settings before running next build.",
      "Reference: frontend-next/.env.local.example",
    ].join("\n")
  );
}

validateProductionEnv();

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  webpack(config) {
    // @metamask/sdk pulls in a React Native storage dependency that doesn't
    // exist in the browser. Stub it out so the bundler doesn't error.
    config.resolve.alias["@react-native-async-storage/async-storage"] =
      false;

    // pino (used by WalletConnect) optionally requires pino-pretty at runtime
    // for pretty-printing logs. It's not installed and not needed in the browser.
    config.resolve.alias["pino-pretty"] = false;

    return config;
  },
};

export default nextConfig;
