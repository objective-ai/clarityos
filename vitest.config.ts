import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "lib/**/*.test.ts",
      "store/**/*.test.ts",
      "components/**/*.test.tsx",
      "types/**/*.test.ts",
    ],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: [
        "store/**/*.ts",
        "lib/**/*.ts",
        "components/encounter/**/*.tsx",
        "components/optical/**/*.tsx",
        "components/patient/**/*.tsx",
      ],
      exclude: ["**/types/**", "**/*.d.ts"],
    },
  },
});
