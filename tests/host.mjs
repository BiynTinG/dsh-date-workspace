/**
 * Host-half test for `dsh-date-workspace`: the row config decides the base
 * directory published to the page as an index-injection global.
 * Run with: node tests/host.mjs
 */
import { apply, DEFAULT_BASE, GLOBAL_KEY } from "../lib/index.js";

/**
 * Run one apply with a stub context and return the rows it publishes.
 * @param {{ baseDir?: string } | undefined} config - row config.
 * @returns {{ event: string, rows: object[] }} captured emit.
 */
function publish(config) {
	const listeners = [];
	const ctx = {
		on(event, listener) {
			listeners.push({ event, listener });
			return () => {};
		}
	};
	apply(ctx, config);
	if (listeners.length !== 1) throw new Error(`expected one index-inject listener, got ${listeners.length}`);
	const { event, listener } = listeners[0];
	const table = [];
	listener(table, { kind: "owner" });
	return { event, rows: table };
}

const configured = publish({ baseDir: "E:\\工作空间\\dsh-work" });
if (configured.event !== "webserver/index-inject") throw new Error(`unexpected event ${configured.event}`);
if (configured.rows.length !== 1) throw new Error(`expected one injected row, got ${configured.rows.length}`);
const row = configured.rows[0];
if (row.kind !== "global" || row.name !== GLOBAL_KEY) throw new Error("expected the plugin global row");
if (row.value?.baseDir !== "E:\\工作空间\\dsh-work") throw new Error(`config not published: ${row.value?.baseDir}`);

const padded = publish({ baseDir: "  E:\\padded  " });
if (padded.rows[0].value.baseDir !== "E:\\padded") throw new Error("configured base must be trimmed");

const blank = publish({ baseDir: "   " });
if (blank.rows[0].value.baseDir !== DEFAULT_BASE) throw new Error("blank config must fall back to the default");

const missing = publish(void 0);
if (missing.rows[0].value.baseDir !== DEFAULT_BASE) throw new Error("absent config must fall back to the default");

console.log("host ok", { default: DEFAULT_BASE, configured: row.value.baseDir });
