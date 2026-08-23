import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sites } from "@openai/sites-vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

const hostingConfigPath = fileURLToPath(new URL("./.openai/hosting.json", import.meta.url));
const hostingConfig = existsSync(hostingConfigPath)
  ? JSON.parse(readFileSync(hostingConfigPath, "utf8")) as { d1?: string | null; r2?: string | null }
  : { d1: null, r2: null };
const hasHostingConfig = existsSync(hostingConfigPath);

const PLACEHOLDER_DATABASE_ID = "00000000-0000-4000-8000-000000000000";
const { d1, r2 } = hostingConfig;
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

function optionalSitesPlugin() {
  const plugin = sites();
  const originalCloseBundle = plugin.closeBundle;
  plugin.closeBundle = async function (this: any, error?: Error) {
    if (!existsSync(hostingConfigPath) || !originalCloseBundle) return;
    if (typeof originalCloseBundle === "function") return originalCloseBundle.call(this, error);
    return originalCloseBundle.handler.call(this, error);
  };
  return plugin;
}

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    server: isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : undefined,
    plugins: [
      vinext(),
      ...(hasHostingConfig ? [optionalSitesPlugin()] : []),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          d1_databases: d1 ? [{ binding: d1, database_name: "h2-testlens-d1", database_id: PLACEHOLDER_DATABASE_ID }] : [],
          r2_buckets: r2 ? [{ binding: r2, bucket_name: "h2-testlens-r2" }] : [],
        },
      }),
    ],
  };
});
