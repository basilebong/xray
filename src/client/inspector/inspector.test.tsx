import { HttpResponse, http } from "msw";

import { server } from "@/test-server.ts";

import { registerHappyDom } from "../test-happy-dom.ts";
import { afterEach, describe, expect, it } from "bun:test";

registerHappyDom();
const { cleanup, render, screen, waitFor } = await import("@testing-library/react");
const { renderWithRouter } = await import("../test-utils.tsx");

afterEach(() => cleanup());

const REPLAY_ID = "44444444-4444-4444-4444-444444444444";

interface ReplayDetailFixture {
	id: string;
	conversation_hash: string;
	lifecycle_state:
		| "pending"
		| "running"
		| "recording_uploaded"
		| "analyzing"
		| "completed"
		| "failed";
	analysis_step: "vad" | "turns" | null;
	failure_reason:
		| "stalled"
		| "timeout"
		| "explicit_fail"
		| "max_attempts_exceeded"
		| "worker_lost"
		| "upload_failed"
		| "driver_aborted"
		| "agent_not_joined"
		| "audio_missing"
		| null;
	started_at: string;
	finished_at: string | null;
	audio_path: string | null;
	job_id: string | null;
	run_config: unknown;
	turns: Array<{
		idx: number;
		role: "user" | "agent";
		turn_start_ms: number;
		turn_end_ms: number;
		voice_start_ms: number;
		voice_end_ms: number;
	}>;
	speech_segments: Array<{
		id: number;
		channel: "user" | "agent";
		start_ms: number;
		end_ms: number;
	}>;
	tool_calls: never[];
	model_usage: never[];
	spans: never[];
}

function buildReplay(overrides: Partial<ReplayDetailFixture> = {}): ReplayDetailFixture {
	return {
		id: REPLAY_ID,
		conversation_hash: "a".repeat(64),
		lifecycle_state: "completed",
		analysis_step: null,
		failure_reason: null,
		started_at: "2026-05-15T10:00:00.000Z",
		finished_at: "2026-05-15T10:00:30.000Z",
		audio_path: null,
		job_id: null,
		run_config: null,
		turns: [
			{
				idx: 0,
				role: "user",
				turn_start_ms: 0,
				turn_end_ms: 2500,
				voice_start_ms: 100,
				voice_end_ms: 2400,
			},
			{
				idx: 1,
				role: "agent",
				turn_start_ms: 3000,
				turn_end_ms: 6500,
				voice_start_ms: 3100,
				voice_end_ms: 6400,
			},
		],
		speech_segments: [],
		tool_calls: [],
		model_usage: [],
		spans: [],
		...overrides,
	};
}

function mockReplay(replay: ReplayDetailFixture) {
	server.use(http.get(`http://localhost/v1/replays/${replay.id}`, () => HttpResponse.json(replay)));
}

describe("Inspector empty states", () => {
	it("renders the @xray.trace copy when the replay has no spans", async () => {
		mockReplay(buildReplay({ spans: [] }));
		const { ui } = renderWithRouter({ initialEntries: [`/replays/${REPLAY_ID}`] });
		render(ui);

		const empty = await waitFor(() => screen.getByText(/No trace spans recorded/i));
		expect(empty.textContent).toMatch(/@xray\.trace\.stage/);
		expect(empty.textContent).toMatch(/docs\/SDK\.md/);
	});

	it("explains that VAD populates the Turns card when none have been derived", async () => {
		mockReplay(buildReplay({ turns: [] }));
		const { ui } = renderWithRouter({ initialEntries: [`/replays/${REPLAY_ID}`] });
		render(ui);

		const empty = await waitFor(() => screen.getByText(/No turns derived yet/i));
		expect(empty.textContent).toMatch(/VAD analysis/);
	});
});

describe("Inspector header", () => {
	it("shows the lifecycle state as a status badge", async () => {
		mockReplay(buildReplay({ lifecycle_state: "failed", failure_reason: "driver_aborted" }));
		const { ui } = renderWithRouter({ initialEntries: [`/replays/${REPLAY_ID}`] });
		render(ui);

		const badge = await waitFor(() => screen.getByLabelText(/failed: driver_aborted/i));
		expect(badge).toBeTruthy();
	});
});
