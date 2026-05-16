import type { ProviderId } from "./types.ts";

/** All providers the codebase knows about — handy for `.each` parameterised tests. */
export const ALL_PROVIDERS = [
	"elevenlabs",
	"vapi",
	"retell",
	"openai-realtime",
	"voiceflow",
] as const satisfies readonly ProviderId[];
