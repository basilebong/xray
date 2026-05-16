import type { VoiceAgentAdapter } from "../adapter/types.ts";
import { DuplicateAdapterError } from "../errors/errors.ts";
import type { ProviderId } from "../provider/types.ts";

const registry = new Map<ProviderId, VoiceAgentAdapter>();

export function registerAdapter(adapter: VoiceAgentAdapter): void {
	// Reject double-registration to surface adapter-init bugs early — silent
	// overwrite would hide which copy is winning.
	if (registry.has(adapter.provider)) {
		throw new DuplicateAdapterError(adapter.provider);
	}
	registry.set(adapter.provider, adapter);
}

export function getAdapter(provider: ProviderId): VoiceAgentAdapter | undefined {
	return registry.get(provider);
}

export function listAdapters(): VoiceAgentAdapter[] {
	return Array.from(registry.values());
}

export function _clearRegistryForTests(): void {
	registry.clear();
}
