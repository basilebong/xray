export class StoreError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		// Set explicitly per class — `new.target.name` would be mangled by minifiers.
		this.name = "StoreError";
	}
}

export class StoreParentDirNotFoundError extends StoreError {
	readonly path: string;
	readonly parent: string;

	constructor(path: string, parent: string) {
		super(`Cannot open SQLite store at "${path}" — parent directory "${parent}" does not exist`);
		this.name = "StoreParentDirNotFoundError";
		this.path = path;
		this.parent = parent;
	}
}
