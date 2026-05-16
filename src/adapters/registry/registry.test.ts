import { describe, expect, it } from "vitest";

import { makeFakeAdapter } from "../adapter/test-utils.ts";
import { DuplicateAdapterError } from "../errors/errors.ts";
import { getAdapter, listAdapters, registerAdapter } from "./registry.ts";
import { useCleanRegistry } from "./test-utils.ts";

describe("adapter registry", () => {
	useCleanRegistry();

	it("retrieves an adapter by provider after registration", () => {
		const adapter = makeFakeAdapter("elevenlabs");
		registerAdapter(adapter);
		expect(getAdapter("elevenlabs")).toBe(adapter);
	});

	it("returns undefined for an unregistered provider", () => {
		expect(getAdapter("vapi")).toBeUndefined();
	});

	it("throws DuplicateAdapterError on double registration of the same provider", () => {
		registerAdapter(makeFakeAdapter("elevenlabs"));
		expect(() => registerAdapter(makeFakeAdapter("elevenlabs"))).toThrow(DuplicateAdapterError);
	});

	it("lists every registered adapter in registration order", () => {
		const a = makeFakeAdapter("elevenlabs");
		const b = makeFakeAdapter("vapi");
		registerAdapter(a);
		registerAdapter(b);
		expect(listAdapters()).toEqual([a, b]);
	});
});
