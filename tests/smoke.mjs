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
	},
	removeItem() {
		this.value = void 0;
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
	useSyncExternalStore(_subscribe, getSnapshot) {
		return getSnapshot();
	},
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
let failing = false;
/** Stub for the plugin's own ensure route. */
globalThis.fetch = async (url, init) => {
	if (url !== "api/dsh-date-workspace/ensure") throw new Error(`unexpected fetch ${url}`);
	const body = JSON.parse(init.body);
	calls.push(body.path);
	if (failing) return { ok: false, status: 400, json: async () => ({ ok: false, error: "access denied" }) };
	return { ok: true, status: 200, json: async () => ({ ok: true, path: body.path }) };
};
const directory = {
	async pickDirectory() {
		return null;
	}
};

const registrations = [];
const settingsRegistrations = [];
const formStub = {
	getSnapshot: () => ({
		status: "ready",
		value: { baseDir: "E:\\注入的工作区" },
		writable: true
	}),
	subscribe: () => () => {},
	set: async () => true,
	unset: async () => true
};
const slotTable = (bucket) => ({
	inject(_hole, listener) {
		const produced = listener();
		if (produced !== void 0 && typeof produced.next === "function") {
			let step = produced.next();
			while (step.done !== true) step = produced.next();
		}
		return () => {};
	},
	register(options, component) {
		bucket.push({ options, component });
		return () => {};
	}
});
const settingsCtx = {
	configForms: {
		get(entryId) {
			if (entryId !== "date-workspace") throw new Error(`unexpected settings namespace ${entryId}`);
			return formStub;
		}
	},
	effect(factory) {
		factory();
		return () => {};
	},
	slots: slotTable(settingsRegistrations)
};
const ctx = {
	uiWorkspace: directory,
	slots: slotTable(registrations),
	inject(names, callback) {
		if (!names.includes("configForms")) throw new Error(`unexpected inject ${names}`);
		callback(settingsCtx);
	}
};
moduleExports.apply(ctx);
if (registrations.length !== 2) throw new Error(`expected 2 hole registrations, got ${registrations.length}`);
for (const { options } of registrations) {
	if (options.priority !== -1) throw new Error("expected priority -1 to shadow the shipped occupant");
	if (typeof options.inject !== "function") throw new Error("expected an injected face factory");
}
const injected = registrations[0].options.inject();

// The settings domain is composed: one bundle-config page for this package, and
// the mirror already republished the base directory as the dialog's global.
if (settingsRegistrations.length !== 1) throw new Error(`expected 1 settings page, got ${settingsRegistrations.length}`);
const settingsEntry = settingsRegistrations[0].options;
if (settingsEntry.name !== "plugins.bundle.config" || settingsEntry.key !== "dsh-date-workspace") {
	throw new Error(`unexpected settings slot ${settingsEntry.name}#${settingsEntry.key}`);
}
if (globalThis.__DSH_DATE_WORKSPACE__?.baseDir !== "E:\\注入的工作区") {
	throw new Error("settings mirror did not publish the base directory");
}

// ensure() posts the whole path to this plugin's own host route: the composed
// picker may be the `native` backend, which has no createDirectory at all.
await injected.ensure("D:\\工作空间\\dsh-work\\2026-11-12");
if (calls.length !== 1) throw new Error(`expected one ensure call, got ${calls.length}`);
if (calls[0] !== "D:\\工作空间\\dsh-work\\2026-11-12") throw new Error(`wrong path sent: ${calls[0]}`);

// An idempotent second call succeeds the same way (the host mkdir tolerates EEXIST).
calls.length = 0;
await injected.ensure("D:\\工作空间\\dsh-work\\2026-11-12");
if (calls.length !== 1) throw new Error("second ensure must still post once");

// A route failure surfaces its message.
failing = true;
let surfaced;
try {
	await injected.ensure("D:\\工作空间\\blocked");
} catch (error) {
	surfaced = error;
}
failing = false;
if (!String(surfaced?.message).includes("access denied")) throw new Error(`unexpected failure was swallowed: ${surfaced}`);

// A non-absolute path never reaches the wire.
calls.length = 0;
let rejected;
try {
	await injected.ensure("relative\\path");
} catch (error) {
	rejected = error;
}
if (calls.length !== 0) throw new Error("a relative path must not be posted");
if (rejected === void 0) throw new Error("a relative path must be rejected");

// The dialog component renders an element while open and nothing while closed.
const component = registrations[0].component;
const props = {
	open: true,
	busy: false,
	onPicked() {},
	onCancel() {},
	onError() {},
	pick: injected.pick,
	ensure: injected.ensure
};
if (component({ ...props, open: false }) !== null) throw new Error("closed dialog must render nothing");
const element = component(props);
if (element === null || element === void 0) throw new Error("open dialog rendered nothing");

/** Walk the stub element tree. */
function walk(node, visit) {
	if (node === null || node === void 0) return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (typeof node !== "object") return;
	visit(node);
	walk(node.portal, visit);
	walk(node.children, visit);
}

/** Find the base-directory text input. */
function baseInput(tree) {
	let found;
	walk(tree, (node) => {
		if (found === void 0 && node.type === "input" && node.props?.type === "text") found = node;
	});
	if (found === void 0) throw new Error("no base-directory input rendered");
	return found;
}

/** Find a button by its title attribute. */
function buttonByTitle(tree, title) {
	let found;
	walk(tree, (node) => {
		if (found === void 0 && node.type === "button" && node.props?.title === title) found = node;
	});
	if (found === void 0) throw new Error(`no button titled ${title}`);
	return found;
}

// Base directory precedence: remembered choice > plugin row config > default.
const CONFIGURED = "E:\\插件配置的工作区";
globalThis.__DSH_DATE_WORKSPACE__ = { baseDir: CONFIGURED };
globalThis.localStorage.value = void 0;
if (baseInput(component(props)).props.value !== CONFIGURED) throw new Error("plugin config did not prefill the base directory");

globalThis.localStorage.value = "F:\\临时覆盖";
const remembered = baseInput(component(props));
if (remembered.props.value !== "F:\\临时覆盖") throw new Error("remembered base did not win over the plugin config");

// The "default" button clears the remembered override and restores the config.
buttonByTitle(component(props), CONFIGURED).props.onClick();
if (globalThis.localStorage.value !== void 0) throw new Error("reset did not clear the remembered base");
if (baseInput(component(props)).props.value !== CONFIGURED) throw new Error("reset did not restore the configured base");

// The configuration page renders the effective value from the settings form.
const settingsComponent = settingsRegistrations[0].component;
const settingsTree = settingsComponent({ form: formStub, view: "page" });
if (baseInput(settingsTree).props.value !== "E:\\注入的工作区") throw new Error("settings page did not render the effective base");

console.log("smoke ok", fileURLToPath(new URL("../lib/client.js", import.meta.url)));
