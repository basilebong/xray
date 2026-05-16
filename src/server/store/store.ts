import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import type { Env } from "@/server/env/env.ts";

import { StoreParentDirNotFoundError } from "./errors.ts";
import * as schema from "./schema.ts";
import { Database } from "bun:sqlite";

const MIGRATIONS_FOLDER = new URL("./migrations", import.meta.url).pathname;

export type StoreSchema = typeof schema;
export type StoreDb = BunSQLiteDatabase<StoreSchema>;

export interface Store {
	readonly db: StoreDb;
	close(): void;
}

export interface OpenStoreOptions {
	/**
	 * Filesystem path to the SQLite database, or `:memory:` for an ephemeral
	 * test database. Parent directory must already exist for file paths —
	 * `openStore` validates and throws `StoreParentDirNotFoundError` if not.
	 * Use `openStoreFromEnv` when you want the directory created for you.
	 */
	path: string;
}

/**
 * Open (or create) the xray SQLite store, run any pending migrations, and
 * return a Drizzle handle. Reopening an existing DB is a no-op — drizzle's
 * `__drizzle_migrations` table records which migrations have already run.
 *
 * Throws `StoreParentDirNotFoundError` (a `StoreError` subclass) if the
 * parent directory of `opts.path` does not exist. This converts SQLite's
 * opaque `SQLITE_CANTOPEN` into a typed boundary error operators can act on.
 */
export function openStore(opts: OpenStoreOptions): Store {
	if (opts.path !== ":memory:") {
		const parent = dirname(opts.path);
		if (!existsSync(parent)) {
			throw new StoreParentDirNotFoundError(opts.path, parent);
		}
	}
	const sqlite = new Database(opts.path, { create: true, strict: true });
	// WAL: readers and the single writer don't block each other. Safe choice
	// since one Bun process owns the DB (see `.claude/rules/single-image-distribution.md`).
	sqlite.exec("PRAGMA journal_mode = WAL");
	// FK enforcement is off by default in SQLite. Required for ON DELETE CASCADE.
	sqlite.exec("PRAGMA foreign_keys = ON");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return { db, close: () => sqlite.close() };
}

/**
 * Bootstrap helper: ensure `env.XRAY_DATA_DIR` exists, then open the SQLite
 * store at `<XRAY_DATA_DIR>/xray.db`. Called once at server startup so the
 * env var is actually load-bearing — without a consumer, an operator
 * changing `XRAY_DATA_DIR` would see no behavioral change.
 */
export function openStoreFromEnv(env: Env): Store {
	mkdirSync(env.XRAY_DATA_DIR, { recursive: true });
	return openStore({ path: join(env.XRAY_DATA_DIR, "xray.db") });
}
