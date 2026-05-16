import { afterEach, beforeEach } from "vitest";

import { _clearRegistryForTests } from "./registry.ts";

export function useCleanRegistry(): void {
	beforeEach(() => _clearRegistryForTests());
	afterEach(() => _clearRegistryForTests());
}
