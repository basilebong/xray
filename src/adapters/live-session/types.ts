import type { ConversationId, Turn } from "../conversation/types.ts";

/**
 * Handle to a live, in-progress conversation. The adapter owns the SDK and
 * pushes events through `onTurn`; the consumer signals end-of-conversation
 * via `stop()`.
 */
export interface LiveSession {
	conversationId: ConversationId;
	/** Subscribe to streaming turns; returns an unsubscribe function. */
	onTurn(handler: (turn: Turn) => void): () => void;
	/** End the live session and release mic / SDK resources. */
	stop(): Promise<void>;
}
