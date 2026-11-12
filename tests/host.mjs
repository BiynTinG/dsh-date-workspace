/**
 * Host-half test for `dsh-date-workspace`: the volatile row config decides the
 * base directory published to the page as an index-injection global.
 * Run with: node tests/host.mjs
 */
import { apply, Config, DEFAULT_BASE, GLOBAL_KEY } from "../lib/index.js";

/**
 * Run one apply with a stub context and capture its index-injection listener.
 * @param {object | undefined} config - parsed row config.
 * @returns {{ total: number, emit: () => object[] }} listener count and one emit.
 */
function harness(config) {
	const listeners = [];
	const ctx = {
		on(event, listener) {
			listeners.push({ event, listener });
			return () => {};
		}
	};
	apply(ctx, config);
	return {
		total: listeners.length,
		emit() {
			const table = [];
			for (const { event, listener } of listeners) {
				if (event !== "webserver/index-inject") continue;
				listener(table, { kind: "owner" });
			}
			return table;
		}
	};
}

/** @param {object[]} rows - injected rows. @returns {string} the published base. */
function published(rows) {
	if (rows.length !== 1) throw new Error(`expected one injected row, got ${rows.length}`);
	const [row] = rows;
	if (row.kind !== "global" || row.name !== GLOBAL_KEY) throw new Error("expected the plugin global row");
	return row.value?.baseDir;
}

// Default: the schema supplies D:\工作空间\dsh-work.
const defaults = harness(Config({}));
if (defaults.total !== 1) throw new Error(`expected one listener, got ${defaults.total}`);
if (published(defaults.emit()) !== DEFAULT_BASE) throw new Error("schema default not published");

// A configured row keeps the value, trimmed.
if (published(harness(Config({ baseDir: "  E:\\工作空间\\dsh-work  " })).emit()) !== "E:\\工作空间\\dsh-work") {
	throw new Error("configured base must be trimmed and published");
}

// Blank text falls back to the default instead of creating at a relative path.
if (published(harness(Config({ baseDir: "   " })).emit()) !== DEFAULT_BASE) throw new Error("blank config must fall back");

// No parsed config at all (the entry has no config yet).
if (published(harness(void 0).emit()) !== DEFAULT_BASE) throw new Error("absent config must fall back");

// A live volatile reference: the listener reads it per index render, so a
// Settings write is visible on the next page load without a restart.
let current = "F:\\live-one";
const live = harness({ baseDir: { get: () => current } });
if (published(live.emit()) !== "F:\\live-one") throw new Error("live reference not read");
current = "G:\\live-two";
if (published(live.emit()) !== "G:\\live-two") throw new Error("live reference not re-read");

console.log("host ok", { default: DEFAULT_BASE, configured: Config({ baseDir: "E:\\工作空间\\dsh-work" }).baseDir.get() });
