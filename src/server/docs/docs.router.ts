import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";

import { buildAsyncApiDoc } from "./docs.asyncapi.ts";
import { buildOpenApiDoc } from "./docs.openapi.ts";

/**
 * Mounts the API-documentation surfaces:
 *
 * - `GET /openapi.json` — OpenAPI 3.1 spec for the HTTP routes + text-replay webhook.
 * - `GET /asyncapi.json` — AsyncAPI 3.0 spec for the realtime-replay WS frames.
 * - `GET /docs` — Scalar UI rendering the OpenAPI doc (with a link to `/asyncapi.json`).
 *
 * The `app` arg is the fully-composed Hono instance — the docs router must
 * see every route in order to enumerate them. `createApp` therefore wires the
 * routers first, then attaches this router to the same instance.
 *
 * Both specs are pure functions of source code — they cannot change between
 * requests in a given process. The router caches the serialized JSON body on
 * first request and replays it; Scalar's `/docs` UI re-fetches `/openapi.json`
 * on every page load, so the saving is per-page-load, not negligible.
 */
export function createDocsRouter(app: Hono): Hono {
	const router = new Hono();

	let openApiJson: string | undefined;
	let asyncApiJson: string | undefined;

	router.get("/openapi.json", async (c) => {
		openApiJson ??= JSON.stringify(await buildOpenApiDoc(app));
		return c.body(openApiJson, 200, { "Content-Type": "application/json" });
	});

	router.get("/asyncapi.json", (c) => {
		asyncApiJson ??= JSON.stringify(buildAsyncApiDoc());
		return c.body(asyncApiJson, 200, { "Content-Type": "application/json" });
	});

	router.get(
		"/docs",
		Scalar({
			url: "/openapi.json",
			pageTitle: "xray API reference",
			theme: "default",
		}),
	);

	return router;
}
