/**
 * Runs the private API server and the Vite dev server together, so the studio
 * can be tested at http://127.0.0.1:5173 while uploads stay on the local API.
 */
import { join } from "node:path";

export {};

const viteEntry = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");

const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, PORT: process.env.PORT?.trim() || "8787" },
});

const web = Bun.spawn(["bun", viteEntry, "--host", "127.0.0.1", "--port", "5173"], {
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const shutdown = () => {
  api.kill();
  web.kill();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[dev] Studio API http://127.0.0.1:8787  ·  Web http://127.0.0.1:5173");

await Promise.race([api.exited, web.exited]);
shutdown();
