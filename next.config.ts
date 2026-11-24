import type { NextConfig } from "next";
import { resolveAppEnv } from "./src/lib/app-env";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Entorno del build (spec 32): queda escrito en el código. En Vercel, si no se conoce, el build falla acá
  env: {
    APP_ENV: resolveAppEnv({ VERCEL: process.env.VERCEL, VERCEL_ENV: process.env.VERCEL_ENV }),
  },
  experimental: {
    // Las páginas leen localStorage y se renderizan solo en el cliente (ver StoreHydrator):
    // se valida la navegación instantánea únicamente en los segmentos que declaren `instant`
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
