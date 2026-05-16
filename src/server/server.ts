import { Hono } from "hono";

import { loadEnv } from "./env/env.ts";
import { healthz } from "./healthz/healthz.ts";

export const app = new Hono();

app.route("/healthz", healthz);

/* v8 ignore start -- bootstrap, exercised by Bun at runtime not vitest */
if (import.meta.main) {
	// Dynamic import so vitest's Node loader doesn't try to resolve `bun:sqlite`
	// transitively through the static import graph. The store is only ever
	// opened in the Bun runtime entry; tests exercise `openStoreFromEnv` directly.
	const { openStoreFromEnv } = await import("./store/store.ts");
	const env = loadEnv();
	// Open the store at boot so migrations run before the first request and
	// any misconfiguration fails-fast instead of surfacing on a route handler.
	openStoreFromEnv(env);
	const server = Bun.serve({ port: env.PORT, hostname: env.HOST, fetch: app.fetch });
	console.info(
		`xray listening on ${server.hostname}:${server.port} (db=${env.XRAY_DATA_DIR}/xray.db)`,
	);
}
/* v8 ignore stop */
