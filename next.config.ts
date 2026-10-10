import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // The live re-read route re-ingests the stored vendor files; ship them with the function.
  outputFileTracingIncludes: {
    "/api/extract": ["./data/vendor-replies/**/*"],
  },
  serverExternalPackages: ["sharp", "unpdf"],
};

export default nextConfig;
