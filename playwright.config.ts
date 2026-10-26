import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;

// E2E runs against the production static export (`npm run build` first).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx serve out -l ${PORT} --no-clipboard`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    // iPhone viewports, run in Chromium so only one browser is needed.
    { name: "iphone-se", use: { ...devices["iPhone SE (3rd gen)"], browserName: "chromium" } },
    { name: "iphone-15-pro-max", use: { ...devices["iPhone 15 Pro Max"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
