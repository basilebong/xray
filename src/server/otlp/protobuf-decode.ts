/**
 * OTLP/Protobuf → OTLP/JSON-shape decoder for the trace export request.
 *
 * xray accepts BOTH OTLP/JSON (the SDK's preferred wire) and
 * OTLP/Protobuf (the default of every stock OTEL exporter). The
 * `otlp.router.ts` content-type dispatch hands protobuf bodies here;
 * JSON bodies skip this path entirely.
 *
 * The decoder produces the JSON-projected shape the existing Valibot
 * schema (`ExportTraceServiceRequestSchema` in `otlp.types.ts`)
 * already accepts — `traceId` hex strings, `startTimeUnixNano` as
 * decimal strings, OTLP/JSON camelCase keys preserved verbatim from
 * the OTel wire spec.
 *
 * No external decoder dep — the OTLP wire shape uses only varint /
 * length-delimited / fixed32 / fixed64 wire types, which fit in ~40
 * lines of reader code. Coverage matches the proto definitions in:
 *  https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto
 *  https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/common/v1/common.proto
 */

interface OtlpJsonRequest {
	resourceSpans?: OtlpJsonResourceSpans[];
}

interface OtlpJsonResourceSpans {
	resource?: OtlpJsonResource;
	scopeSpans?: OtlpJsonScopeSpans[];
	schemaUrl?: string;
}

interface OtlpJsonResource {
	attributes?: OtlpJsonAttribute[];
	droppedAttributesCount?: number;
}

interface OtlpJsonScopeSpans {
	scope?: OtlpJsonScope;
	spans?: OtlpJsonSpan[];
	schemaUrl?: string;
}

interface OtlpJsonScope {
	name?: string;
	version?: string;
	attributes?: OtlpJsonAttribute[];
	droppedAttributesCount?: number;
}

interface OtlpJsonSpan {
	traceId: string;
	spanId: string;
	traceState?: string;
	parentSpanId?: string;
	name: string;
	kind?: number;
	startTimeUnixNano: string;
	endTimeUnixNano: string;
	attributes?: OtlpJsonAttribute[];
	droppedAttributesCount?: number;
	events?: OtlpJsonSpanEvent[];
	droppedEventsCount?: number;
	links?: OtlpJsonSpanLink[];
	droppedLinksCount?: number;
	status?: OtlpJsonStatus;
	flags?: number;
}

interface OtlpJsonSpanEvent {
	timeUnixNano: string;
	name: string;
	attributes?: OtlpJsonAttribute[];
	droppedAttributesCount?: number;
}

interface OtlpJsonSpanLink {
	traceId: string;
	spanId: string;
	traceState?: string;
	attributes?: OtlpJsonAttribute[];
	droppedAttributesCount?: number;
	flags?: number;
}

interface OtlpJsonStatus {
	message?: string;
	code?: number;
}

interface OtlpJsonAttribute {
	key: string;
	value: OtlpJsonAnyValue;
}

type OtlpJsonAnyValue =
	| { stringValue: string }
	| { boolValue: boolean }
	| { intValue: string }
	| { doubleValue: number }
	| { arrayValue: { values: OtlpJsonAnyValue[] } }
	| { kvlistValue: { values: OtlpJsonAttribute[] } }
	| { bytesValue: string };

/**
 * Minimal protobuf reader — only the wire types OTLP traces use:
 * varint (0), fixed64 (1), length-delimited (2), fixed32 (5).
 *
 * State is the underlying buffer + a moving cursor. The reader's
 * methods consume bytes; the cursor advances. `skip(wireType)` is the
 * fallback for unknown fields.
 */
class Reader {
	private readonly buf: Uint8Array;
	private pos: number;
	private readonly textDecoder: TextDecoder;

	constructor(buf: Uint8Array) {
		this.buf = buf;
		this.pos = 0;
		this.textDecoder = new TextDecoder();
	}

	isAtEnd(): boolean {
		return this.pos >= this.buf.length;
	}

	readTag(): { fieldNumber: number; wireType: number } {
		const raw = this.readVarint();
		return { fieldNumber: raw >>> 3, wireType: raw & 0x7 };
	}

	readVarint(): number {
		let result = 0;
		let shift = 0;
		while (this.pos < this.buf.length) {
			const b = this.buf[this.pos++] ?? 0;
			result += (b & 0x7f) * 2 ** shift;
			shift += 7;
			if ((b & 0x80) === 0) break;
		}
		return result;
	}

	readBytes(): Uint8Array {
		const len = this.readVarint();
		const slice = this.buf.subarray(this.pos, this.pos + len);
		this.pos += len;
		return slice;
	}

	readString(): string {
		return this.textDecoder.decode(this.readBytes());
	}

	readFixed32(): number {
		const b0 = this.buf[this.pos] ?? 0;
		const b1 = this.buf[this.pos + 1] ?? 0;
		const b2 = this.buf[this.pos + 2] ?? 0;
		const b3 = this.buf[this.pos + 3] ?? 0;
		this.pos += 4;
		return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
	}

	readFixed64AsString(): string {
		const lo = this.readFixed32();
		const hi = this.readFixed32();
		if (hi === 0) return lo.toString();
		return (BigInt(hi) * 2n ** 32n + BigInt(lo)).toString();
	}

	readFixed64AsDouble(): number {
		const lo = this.readFixed32();
		const hi = this.readFixed32();
		const view = new DataView(new ArrayBuffer(8));
		view.setUint32(0, lo, true);
		view.setUint32(4, hi, true);
		return view.getFloat64(0, true);
	}

	skip(wireType: number): void {
		if (wireType === 0) {
			this.readVarint();
		} else if (wireType === 1) {
			this.pos += 8;
		} else if (wireType === 2) {
			this.readBytes();
		} else if (wireType === 5) {
			this.pos += 4;
		} else {
			throw new Error(`unsupported protobuf wire type: ${wireType}`);
		}
	}
}

/**
 * Decode an OTLP/Protobuf trace-export body to the JSON-projected
 * shape. Callers feed the output into
 * `v.safeParse(ExportTraceServiceRequestSchema, ...)`.
 */
export function decodeExportTraceServiceRequest(bytes: Uint8Array): OtlpJsonRequest {
	const reader = new Reader(bytes);
	const resourceSpans: OtlpJsonResourceSpans[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			resourceSpans.push(decodeResourceSpans(reader.readBytes()));
		} else {
			reader.skip(wireType);
		}
	}
	return resourceSpans.length > 0 ? { resourceSpans } : {};
}

function decodeResourceSpans(bytes: Uint8Array): OtlpJsonResourceSpans {
	const reader = new Reader(bytes);
	const out: OtlpJsonResourceSpans = {};
	const scopeSpans: OtlpJsonScopeSpans[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			out.resource = decodeResource(reader.readBytes());
		} else if (fieldNumber === 2 && wireType === 2) {
			scopeSpans.push(decodeScopeSpans(reader.readBytes()));
		} else if (fieldNumber === 3 && wireType === 2) {
			out.schemaUrl = reader.readString();
		} else {
			reader.skip(wireType);
		}
	}
	if (scopeSpans.length > 0) {
		out.scopeSpans = scopeSpans;
	}
	return out;
}

function decodeResource(bytes: Uint8Array): OtlpJsonResource {
	const reader = new Reader(bytes);
	const out: OtlpJsonResource = {};
	const attributes: OtlpJsonAttribute[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			attributes.push(decodeKeyValue(reader.readBytes()));
		} else if (fieldNumber === 2 && wireType === 0) {
			out.droppedAttributesCount = reader.readVarint();
		} else {
			reader.skip(wireType);
		}
	}
	if (attributes.length > 0) {
		out.attributes = attributes;
	}
	return out;
}

function decodeScopeSpans(bytes: Uint8Array): OtlpJsonScopeSpans {
	const reader = new Reader(bytes);
	const out: OtlpJsonScopeSpans = {};
	const spans: OtlpJsonSpan[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			out.scope = decodeScope(reader.readBytes());
		} else if (fieldNumber === 2 && wireType === 2) {
			spans.push(decodeSpan(reader.readBytes()));
		} else if (fieldNumber === 3 && wireType === 2) {
			out.schemaUrl = reader.readString();
		} else {
			reader.skip(wireType);
		}
	}
	if (spans.length > 0) {
		out.spans = spans;
	}
	return out;
}

function decodeScope(bytes: Uint8Array): OtlpJsonScope {
	const reader = new Reader(bytes);
	const out: OtlpJsonScope = {};
	const attributes: OtlpJsonAttribute[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			out.name = reader.readString();
		} else if (fieldNumber === 2 && wireType === 2) {
			out.version = reader.readString();
		} else if (fieldNumber === 3 && wireType === 2) {
			attributes.push(decodeKeyValue(reader.readBytes()));
		} else if (fieldNumber === 4 && wireType === 0) {
			out.droppedAttributesCount = reader.readVarint();
		} else {
			reader.skip(wireType);
		}
	}
	if (attributes.length > 0) {
		out.attributes = attributes;
	}
	return out;
}

function decodeSpan(bytes: Uint8Array): OtlpJsonSpan {
	const reader = new Reader(bytes);
	const out: OtlpJsonSpan = {
		traceId: "",
		spanId: "",
		name: "",
		startTimeUnixNano: "0",
		endTimeUnixNano: "0",
	};
	const attributes: OtlpJsonAttribute[] = [];
	const events: OtlpJsonSpanEvent[] = [];
	const links: OtlpJsonSpanLink[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			out.traceId = toHex(reader.readBytes());
		} else if (fieldNumber === 2 && wireType === 2) {
			out.spanId = toHex(reader.readBytes());
		} else if (fieldNumber === 3 && wireType === 2) {
			out.traceState = reader.readString();
		} else if (fieldNumber === 4 && wireType === 2) {
			out.parentSpanId = toHex(reader.readBytes());
		} else if (fieldNumber === 5 && wireType === 2) {
			out.name = reader.readString();
		} else if (fieldNumber === 6 && wireType === 0) {
			out.kind = reader.readVarint();
		} else if (fieldNumber === 7 && wireType === 1) {
			out.startTimeUnixNano = reader.readFixed64AsString();
		} else if (fieldNumber === 8 && wireType === 1) {
			out.endTimeUnixNano = reader.readFixed64AsString();
		} else if (fieldNumber === 9 && wireType === 2) {
			attributes.push(decodeKeyValue(reader.readBytes()));
		} else if (fieldNumber === 10 && wireType === 0) {
			out.droppedAttributesCount = reader.readVarint();
		} else if (fieldNumber === 11 && wireType === 2) {
			events.push(decodeSpanEvent(reader.readBytes()));
		} else if (fieldNumber === 12 && wireType === 0) {
			out.droppedEventsCount = reader.readVarint();
		} else if (fieldNumber === 13 && wireType === 2) {
			links.push(decodeSpanLink(reader.readBytes()));
		} else if (fieldNumber === 14 && wireType === 0) {
			out.droppedLinksCount = reader.readVarint();
		} else if (fieldNumber === 15 && wireType === 2) {
			out.status = decodeStatus(reader.readBytes());
		} else if (fieldNumber === 16 && wireType === 5) {
			out.flags = reader.readFixed32();
		} else {
			reader.skip(wireType);
		}
	}
	if (attributes.length > 0) {
		out.attributes = attributes;
	}
	if (events.length > 0) {
		out.events = events;
	}
	if (links.length > 0) {
		out.links = links;
	}
	return out;
}

function decodeSpanEvent(bytes: Uint8Array): OtlpJsonSpanEvent {
	const reader = new Reader(bytes);
	const out: OtlpJsonSpanEvent = { timeUnixNano: "0", name: "" };
	const attributes: OtlpJsonAttribute[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 1) {
			out.timeUnixNano = reader.readFixed64AsString();
		} else if (fieldNumber === 2 && wireType === 2) {
			out.name = reader.readString();
		} else if (fieldNumber === 3 && wireType === 2) {
			attributes.push(decodeKeyValue(reader.readBytes()));
		} else if (fieldNumber === 4 && wireType === 0) {
			out.droppedAttributesCount = reader.readVarint();
		} else {
			reader.skip(wireType);
		}
	}
	if (attributes.length > 0) {
		out.attributes = attributes;
	}
	return out;
}

function decodeSpanLink(bytes: Uint8Array): OtlpJsonSpanLink {
	const reader = new Reader(bytes);
	const out: OtlpJsonSpanLink = { traceId: "", spanId: "" };
	const attributes: OtlpJsonAttribute[] = [];
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			out.traceId = toHex(reader.readBytes());
		} else if (fieldNumber === 2 && wireType === 2) {
			out.spanId = toHex(reader.readBytes());
		} else if (fieldNumber === 3 && wireType === 2) {
			out.traceState = reader.readString();
		} else if (fieldNumber === 4 && wireType === 2) {
			attributes.push(decodeKeyValue(reader.readBytes()));
		} else if (fieldNumber === 5 && wireType === 0) {
			out.droppedAttributesCount = reader.readVarint();
		} else if (fieldNumber === 6 && wireType === 5) {
			out.flags = reader.readFixed32();
		} else {
			reader.skip(wireType);
		}
	}
	if (attributes.length > 0) {
		out.attributes = attributes;
	}
	return out;
}

function decodeStatus(bytes: Uint8Array): OtlpJsonStatus {
	const reader = new Reader(bytes);
	const out: OtlpJsonStatus = {};
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 2 && wireType === 2) {
			out.message = reader.readString();
		} else if (fieldNumber === 3 && wireType === 0) {
			out.code = reader.readVarint();
		} else {
			reader.skip(wireType);
		}
	}
	return out;
}

function decodeKeyValue(bytes: Uint8Array): OtlpJsonAttribute {
	const reader = new Reader(bytes);
	let key = "";
	let value: OtlpJsonAnyValue = { stringValue: "" };
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			key = reader.readString();
		} else if (fieldNumber === 2 && wireType === 2) {
			value = decodeAnyValue(reader.readBytes());
		} else {
			reader.skip(wireType);
		}
	}
	return { key, value };
}

function decodeAnyValue(bytes: Uint8Array): OtlpJsonAnyValue {
	const reader = new Reader(bytes);
	while (!reader.isAtEnd()) {
		const { fieldNumber, wireType } = reader.readTag();
		if (fieldNumber === 1 && wireType === 2) {
			return { stringValue: reader.readString() };
		}
		if (fieldNumber === 2 && wireType === 0) {
			return { boolValue: reader.readVarint() !== 0 };
		}
		if (fieldNumber === 3 && wireType === 0) {
			return { intValue: String(reader.readVarint()) };
		}
		if (fieldNumber === 4 && wireType === 1) {
			return { doubleValue: reader.readFixed64AsDouble() };
		}
		if (fieldNumber === 5 && wireType === 2) {
			const values: OtlpJsonAnyValue[] = [];
			const inner = new Reader(reader.readBytes());
			while (!inner.isAtEnd()) {
				const t = inner.readTag();
				if (t.fieldNumber === 1 && t.wireType === 2) {
					values.push(decodeAnyValue(inner.readBytes()));
				} else {
					inner.skip(t.wireType);
				}
			}
			return { arrayValue: { values } };
		}
		if (fieldNumber === 6 && wireType === 2) {
			const values: OtlpJsonAttribute[] = [];
			const inner = new Reader(reader.readBytes());
			while (!inner.isAtEnd()) {
				const t = inner.readTag();
				if (t.fieldNumber === 1 && t.wireType === 2) {
					values.push(decodeKeyValue(inner.readBytes()));
				} else {
					inner.skip(t.wireType);
				}
			}
			return { kvlistValue: { values } };
		}
		if (fieldNumber === 7 && wireType === 2) {
			return { bytesValue: toBase64(reader.readBytes()) };
		}
		reader.skip(wireType);
	}
	return { stringValue: "" };
}

function toHex(bytes: Uint8Array): string {
	let out = "";
	for (const byte of bytes) {
		out += byte.toString(16).padStart(2, "0");
	}
	return out;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}
