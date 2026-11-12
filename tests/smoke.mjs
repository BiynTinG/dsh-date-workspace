/**
 * Smoke test for the browser half of `dsh-date-workspace`.
 *
 * Runs the ModuleLoader factory with stub `react` / `react-dom` modules and a
 * stub Cordis slot registry, then exercises the injected `ensure` face against
 * a fake Host directory API. Run with: node tests/smoke.mjs
 */
import { fileURLToPath } from "node:url";

const loaded = [];
globalThis.window = {
	__ModuleLoader__: {
		load(registration) {
			loaded.push(registration);
		}
	}
};
try {
	Object.defineProperty(globalThis, "navigator", { value: { language: "zh-CN" }, configurable: true });
} catch (_error) {
	/* Node exposes a read-only navigator; the dialog copy falls back to English. */
}
globalThis.localStorage = {
	value: void 0,
	getItem() {
		return this.value ?? null;
	},
	setItem(_key, value) {
		this.value = value;
	}
};
globalThis.document = {
	body: {}
};

const reactStub = {
	useState(initial) {
		return [typeof initial === "function" ? initial() : initial, () => {}];
	},
	useRef(initial) {
		return { current: initial };
	},
	useEffect() {},
	createElement(type, props, ...children) {
		return { type, props, children };
	}
};

const reactDomStub = {
	createPortal(node) {
		return { portal: node };
	}
};

await import(new URL("../lib/client.js", import.meta.url));
const registration = loaded.at(-1);
if (registration === void 0) throw new Error("client bundle registered nothing");
if (registration.id !== "dsh-date-workspace") throw new Error(`unexpected id ${registration.id}`);
const moduleExports = registration.factory((name) => {
	if (name === "react") return reactStub;
	if (name === "react-dom") return reactDomStub;
	throw new Error(`unexpected module request: ${name}`);
});
if (moduleExports.inject.join(",") !== "slots,uiWorkspace") throw new Error("unexpected inject list");

const calls = [];
let existing = new Set();
const directory = {
	async pickDirectory() {
		return null;
	},
	async createDirectory(path, name) {
		const target = `${path}${path.endsWith("\\") || path.endsWith("/") ? "" : "\\"}${name}`;
		calls.push(target);
		if (existing.has(target)) throw { rpcError: { code: "directory-exists", message: `${target} already exists` } };
	}
};

const registrations = [];
const ctx = {
	uiWorkspace: directory,
	slots: {
		inject(_hole, listener) {
			const produced = listener();
			if (produced !== void 0 && typeof produced.next === "function") {
				let step = produced.next();
				while (step.done !== true) step = produced.next();
			}
			return () => {};
		},
		register(options, component) {
			registrations.push({ options, component });
			return () => {};
		}
	}
};
moduleExports.apply(ctx);
if (registrations.length !== 2) throw new Error(`expected 2 hole registrations, got ${registrations.length}`);
for (const { options } of registrations) {
	if (options.priority !== -1) throw new Error("expected priority -1 to shadow the shipped occupant");
	if (typeof options.inject !== "function") throw new Error("expected an injected face factory");
}
const injected = registrations[0].options.inject();

await injected.ensure("D:\\工作空间\\dsh-work\\2026-11-12");
console.log("created segments:", calls.join(" | "));
if (calls.length !== 3) throw new Error(`expected 3 segments, got ${calls.length}`);
if (calls.at(-1) !== "D:\\工作空间\\dsh-work\\2026-11-12") throw new Error("wrong final segment");

// Every level already exists: all three create calls answer EEXIST and the walk
// must still complete without surfacing an error.
calls.length = 0;
existing = new Set([
	"D:\\工作空间",
	"D:\\工作空间\\dsh-work",
	"D:\\工作空间\\dsh-work\\2026-11-12"
]);
await injected.ensure("D:\\工作空间\\dsh-work\\2026-11-12").then(() => {}, (error) => {
	throw new Error(`existing directories rejected: ${error?.rpcError?.code ?? error}`);
});
if (calls.length !== 3) throw new Error("expected the EEXIST walk to still visit every segment");

// A real failure surfaces unchanged.
directory.createDirectory = async () => {
	throw { rpcError: { code: "directory-create-failed", message: "access denied" } };
};
let surfaced;
try {
	await injected.ensure("D:\\工作空间\\blocked");
} catch (error) {
	surfaced = error;
}
if (surfaced?.rpcError?.code !== "directory-create-failed") throw new Error("unexpected failure was swallowed");

// The dialog component renders an element while open and nothing while closed.
const component = registrations[0].component;
if (component({ open: false }) !== null) throw new Error("closed dialog must render nothing");
const element = component({
	open: true,
	busy: false,
	onPicked() {},
	onCancel() {},
	onError() {},
	pick: injected.pick,
	ensure: injected.ensure
});
if (element === null || element === void 0) throw new Error("open dialog rendered nothing");
console.log("smoke ok", fileURLToPath(new URL("../lib/client.js", import.meta.url)));
