/**
 * Host-half test for `dsh-date-workspace`: the volatile row config decides the
 * base directory published to the page, and the ensure route creates the dated
 * directory without the directory-picker capability.
 * Run with: node tests/host.mjs
 */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, Config, DEFAULT_BASE, GLOBAL_KEY, ROUTE, internals } from "../lib/index.js";

/** @param {object | undefined} config - parsed row config. @returns {{rows: () => object[], routes: object[]}} */
function harness(config, withWebServer = true) {
	const listeners = [];
	const routes = [];
	const ctx = {
		on(event, listener) {
			listeners.push({ event, listener });
			return () => {};
		},
		inject(names, callback) {
			// Cordis never calls back while a required service is absent.
			if (!withWebServer) return;
			if (!names.includes("webServer")) throw new Error(`unexpected inject ${names}`);
			callback({
				effect(factory) {
					factory();
					return () => {};
				},
				webServer: {
					register(route) {
						routes.push(route);
						return () => {};
					}
				}
			});
		}
	};
	apply(ctx, config);
	return {
		routes,
		rows() {
			const table = [];
			for (const { event, listener } of listeners) if (event === "webserver/index-inject") listener(table, { kind: "owner" });
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
if (published(harness(Config({})).rows()) !== DEFAULT_BASE) throw new Error("schema default not published");

// A configured row keeps the value, trimmed.
if (published(harness(Config({ baseDir: "  E:\\工作空间\\dsh-work  " })).rows()) !== "E:\\工作空间\\dsh-work") {
	throw new Error("configured base must be trimmed and published");
}

// Blank text falls back to the default.
if (published(harness(Config({ baseDir: "   " })).rows()) !== DEFAULT_BASE) throw new Error("blank config must fall back");

// A live volatile reference: read per call, so a Settings write is visible at once.
let current = "F:\\live-one";
const live = harness({ baseDir: { get: () => current } });
if (published(live.rows()) !== "F:\\live-one") throw new Error("live reference not read");
current = "G:\\live-two";
if (published(live.rows()) !== "G:\\live-two") throw new Error("live reference not re-read");

// The route registers exactly once, as an exact POST route.
if (live.routes.length !== 1) throw new Error(`expected one route, got ${live.routes.length}`);
if (live.routes[0].path !== ROUTE || live.routes[0].kind !== "exact") throw new Error("unexpected route shape");
if (typeof live.routes[0].handler !== "function") throw new Error("route must carry a handler");

// Without a Web server the plugin still publishes its config and registers nothing.
const headless = harness(Config({}), false);
if (headless.routes.length !== 0) throw new Error("no route without a Web server");
if (published(headless.rows()) !== DEFAULT_BASE) throw new Error("config must publish without a Web server");

// ensureDirectory creates nested segments and is idempotent; the root is refused.
const scratch = await mkdtemp(join(tmpdir(), "dsh-date-workspace-"));
try {
	const nested = join(scratch, "dsh-work", "2026-11-12");
	const created = await internals.ensureDirectory(nested);
	if (created !== nested) throw new Error(`unexpected created path ${created}`);
	if (!(await stat(nested)).isDirectory()) throw new Error("target directory missing");
	await internals.ensureDirectory(nested);

	let refused = false;
	try {
		await internals.ensureDirectory(process.platform === "win32" ? "D:\\" : "/");
	} catch {
		refused = true;
	}
	if (!refused) throw new Error("a filesystem root must be refused");

	refused = false;
	try {
		await internals.ensureDirectory("relative\\path");
	} catch {
		refused = true;
	}
	if (!refused) throw new Error("a relative path must be refused");
} finally {
	await rm(scratch, { recursive: true, force: true });
}

// The route fence refuses a non-loopback socket and a forwarded header.
const socket = (address) => ({ socket: { remoteAddress: address }, headers: { host: "127.0.0.1:1234" } });
if (!internals.isTrusted(socket("127.0.0.1"))) throw new Error("loopback must be trusted");
if (!internals.isTrusted(socket("::ffff:127.0.0.1"))) throw new Error("mapped loopback must be trusted");
if (internals.isTrusted(socket("192.168.1.9"))) throw new Error("LAN address must be refused");
if (internals.isTrusted({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:1234", "x-forwarded-for": "1.2.3.4" } })) {
	throw new Error("a proxied request must be refused");
}
if (internals.isTrusted({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "evil.example:1234" } })) {
	throw new Error("a non-loopback Host must be refused");
}

console.log("host ok", { default: DEFAULT_BASE, route: ROUTE });
