import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Printables embed WLA's typefaces (Karla, Fraunces; SIL OFL — see
  // assets/fonts). They are read from disk by the print route and by mission
  // QA's test render, so the deployment bundle must carry them.
  outputFileTracingIncludes: {
    "/api/print/**": ["./assets/fonts/**"],
    "/admin/builder/**": ["./assets/fonts/**"],
  },
};

export default nextConfig;
