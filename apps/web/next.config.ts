import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disables the floating dev-mode indicator badge. Compile/runtime error
  // overlays are a separate mechanism and are unaffected by this setting.
  devIndicators: false,
};

export default nextConfig;
