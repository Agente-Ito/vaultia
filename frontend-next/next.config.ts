import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
