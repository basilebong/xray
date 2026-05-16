import type { Env } from "./env.ts";

export function makeEnv(overrides: Partial<Env> = {}): Env {
	return { PORT: 8080, HOST: "0.0.0.0", XRAY_DATA_DIR: "/tmp/xray-test", ...overrides };
}
