import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // DB-backed test files share one Postgres and clear test_result between tests,
    // so files must not run at the same time.
    fileParallelism: false,
  },
});
