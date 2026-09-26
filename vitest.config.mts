import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * `server-only` is provided by Next.js at build time to make importing a
       * server module from client code a hard error. It has no runtime
       * behaviour, and Vitest cannot resolve it, so it is stubbed here.
       *
       * The guarantee it provides is not weakened: the structural tests in
       * lib/permissions assert that every server-only module still declares
       * the import, and `next build` is what actually enforces it.
       */
      "server-only": fileURLToPath(
        new URL("./src/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});
