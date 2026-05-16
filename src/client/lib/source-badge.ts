import type { SessionListItem } from "@/server/sessions/sessions.types.ts";

/**
 * Pick the shadcn Badge variant for a session source. Two consumers today
 * (the list row and the transcript header) — extracted so the mapping has
 * one home when a future variant (`destructive` for a failed sync?) is
 * added.
 */
export function sourceBadgeVariant(source: SessionListItem["source"]): "default" | "secondary" {
	return source === "ingest" ? "default" : "secondary";
}
