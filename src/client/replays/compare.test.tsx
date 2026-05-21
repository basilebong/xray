import { HttpResponse, http } from "msw";

import { server } from "@/test-server.ts";

import { registerHappyDom } from "../test-happy-dom.ts";
import { afterEach, describe, expect, it } from "bun:test";

registerHappyDom();
const { cleanup, render, screen, waitFor } = await import("@testing-library/react");
const { renderWithRouter } = await import("../test-utils.tsx");

afterEach(() => cleanup());

interface ReplayTurn {
	idx: number;
	role: "user" | "agent";
	turn_start_ms: number;
	turn_end_ms: number;
	voice_start_ms: number;
	voice_end_ms: number;
}

function buildReplay(
	id: string,
	turns: ReplayTurn[],
	run_config: unknown = null,
): {
	id: string;
	conversation_hash: string;
	lifecycle_state: "completed";
	analysis_step: null;
	failure_reason: null;
	started_at: string;
	finished_at: string;
	audio_path: null;
	job_id: null;
	run_config: unknown;
	turns: ReplayTurn[];
	speech_segments: never[];
	tool_calls: never[];
	model_usage: never[];
	spans: never[];
} {
	return {
		id,
		conversation_hash: "a".repeat(64),
		lifecycle_state: "completed",
		analysis_step: null,
		failure_reason: null,
		started_at: "2026-05-15T10:00:00.000Z",
		finished_at: "2026-05-15T10:00:30.000Z",
		audio_path: null,
		job_id: null,
		run_config,
		turns,
		speech_segments: [],
		tool_calls: [],
		model_usage: [],
		spans: [],
	};
}

const TURN_FIXTURE: ReplayTurn = {
	idx: 0,
	role: "user",
	turn_start_ms: 0,
	turn_end_ms: 2500,
	voice_start_ms: 100,
	voice_end_ms: 2400,
};

describe("CompareReplays route", () => {
	it("rejects fewer than 2 replay ids in the query", async () => {
		const { ui } = renderWithRouter({
			initialEntries: ["/compare/replays?ids=11111111-1111-1111-1111-111111111111"],
		});
		render(ui);

		await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/between 2 and 8/));
	});

	it("rejects more than 8 replay ids in the query", async () => {
		const ids = Array.from(
			{ length: 9 },
			(_, i) => `${i.toString(16)}1111111-1111-1111-1111-111111111111`,
		).join(",");
		const { ui } = renderWithRouter({
			initialEntries: [`/compare/replays?ids=${ids}`],
		});
		render(ui);

		await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/between 2 and 8/));
	});

	it("highlights only the run_config keys that differ between replays", async () => {
		const replayA = buildReplay("11111111-1111-1111-1111-111111111111", [TURN_FIXTURE], {
			model: "gpt-4",
			temperature: 0.2,
		});
		const replayB = buildReplay("22222222-2222-2222-2222-222222222222", [TURN_FIXTURE], {
			model: "gpt-4o",
			temperature: 0.2,
		});
		server.use(
			http.post("http://localhost/v1/replays/compare", () =>
				HttpResponse.json({ replays: [replayA, replayB] }),
			),
		);

		const { ui } = renderWithRouter({
			initialEntries: [
				"/compare/replays?ids=11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222",
			],
		});
		render(ui);

		const modelRow = await waitFor(() => screen.getByLabelText("run_config.model"));
		const tempRow = screen.getByLabelText("run_config.temperature");

		const modelCells = modelRow.querySelectorAll("td");
		expect(modelCells.length).toBe(2);
		expect(modelCells[0]?.className).not.toMatch(/bg-yellow/);
		expect(modelCells[1]?.className).toMatch(/bg-yellow/);

		const tempCells = tempRow.querySelectorAll("td");
		for (const cell of tempCells) {
			expect(cell.className).not.toMatch(/bg-yellow/);
		}
	});
});
