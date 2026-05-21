// Production-dependency license gate. Walks `pnpm licenses list --prod --json`
// and fails if any production package is under GPL-*, AGPL-*, or SSPL-*.
//
// Wired up as `pnpm license:check` (-> `bun run scripts/license-check.ts`)
// and runs in the Supply-chain audit job in CI. See the addendum at the
// bottom of LICENSE for the policy this enforces.
//
// LGPL is intentionally NOT in the forbidden set: it carries linking
// caveats but is compatible with redistributing a bundled image, and the
// codebase has chosen not to forbid it. Update this comment and the regex
// together if that ever changes.

import { $ } from "bun";
import * as v from "valibot";

class LicenseCheckError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "LicenseCheckError";
	}
}

const FORBIDDEN_TOKEN = /\b(?:A?GPL|SSPL)/i;

const PnpmPackageEntry = v.object({
	name: v.string(),
	versions: v.array(v.string()),
});

const PnpmLicensesOutput = v.record(v.string(), v.array(PnpmPackageEntry));

function isAcceptable(licenseExpression: string): boolean {
	// SPDX permits expressions like "(MIT OR GPL-2.0)" where the consumer
	// gets to pick — a single acceptable alternative makes the whole
	// package acceptable. "AND" expressions are not handled specially:
	// they collapse to "all tokens scanned", which is the conservative
	// behavior we want (if any token is forbidden, the dep is forbidden).
	const stripped = licenseExpression.replace(/[()]/g, "").trim();
	if (stripped.length === 0) return true;
	const alternatives = stripped.split(/\s+OR\s+/i).map((s) => s.trim());
	return alternatives.some((alt) => !FORBIDDEN_TOKEN.test(alt));
}

type Violation = { name: string; version: string; license: string };

const cmd = await $`pnpm licenses list --prod --json`.quiet().nothrow();
if (cmd.exitCode !== 0) {
	throw new LicenseCheckError(
		`pnpm licenses list exited ${cmd.exitCode}: ${cmd.stderr.toString().trim()}`,
	);
}

const raw: unknown = JSON.parse(cmd.stdout.toString());
const parsed = v.safeParse(PnpmLicensesOutput, raw);
if (!parsed.success) {
	throw new LicenseCheckError(
		`pnpm licenses output did not match expected shape: ${JSON.stringify(parsed.issues)}`,
	);
}

const violations: Violation[] = [];
let totalPackages = 0;
for (const [license, packages] of Object.entries(parsed.output)) {
	for (const pkg of packages) {
		for (const version of pkg.versions) {
			totalPackages += 1;
			if (!isAcceptable(license)) {
				violations.push({ name: pkg.name, version, license });
			}
		}
	}
}

if (violations.length === 0) {
	console.info(
		`license:check OK — ${totalPackages} production package(s); no GPL/AGPL/SSPL detected.`,
	);
	process.exit(0);
}

console.error("license:check FAILED — forbidden license(s) in production dependencies:");
for (const violation of violations) {
	console.error(`  ${violation.name}@${violation.version}  (${violation.license})`);
}
console.error(
	"\nELv2 redistribution requires permissive licenses for bundled deps. See LICENSE addendum.",
);
process.exit(1);
