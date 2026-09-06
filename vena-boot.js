/* Shared VENA web-shell: loader UI, audio hooks, FPS cap, progress. */
(function () {
	"use strict";

	const L = window.VENA_LAUNCH || {};
	const BASE = L.base || "";
	const WORKLET_BASE = L.workletBase || BASE || document.baseURI;
	const PCK_BYTES = L.pckBytes;
	const PCK_PARTS = L.pckParts;
	const WASM_BYTES = L.wasmBytes;
	const SIDE_WASM_BYTES = L.sideWasmBytes;
	const SIDE_WASM_PARTS = L.sideWasmParts;
	const RENDER_CAP = L.renderCap || { w: 960, h: 540 };
	const TOTAL_BYTES = PCK_BYTES + SIDE_WASM_BYTES + WASM_BYTES;

	try {
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			get: function () { return 1; },
		});
	} catch (err) {}

	(function wrapAudio() {
		const Native = window.AudioContext || window.webkitAudioContext;
		if (!Native) return;
		function VenaAudioContext(opts) {
			const next = Object.assign({ latencyHint: "playback" }, opts || {});
			return new Native(next);
		}
		VenaAudioContext.prototype = Native.prototype;
		Object.setPrototypeOf(VenaAudioContext, Native);
		window.AudioContext = VenaAudioContext;
		if ("webkitAudioContext" in window) {
			window.webkitAudioContext = VenaAudioContext;
		}
		if (window.AudioWorklet && AudioWorklet.prototype.addModule) {
			const orig = AudioWorklet.prototype.addModule;
			AudioWorklet.prototype.addModule = function (url, init) {
				const href = String(url);
				if (href.includes("audio.worklet.js") && !href.includes("position")) {
					return orig.call(this, new URL("index.audio.worklet.js", WORKLET_BASE).href, init);
				}
				if (href.includes("audio.position.worklet.js")) {
					return orig.call(this, new URL("index.audio.position.worklet.js", WORKLET_BASE).href, init);
				}
				return orig.call(this, url, init);
			};
		}
	}());

	const WEB_SETTINGS = `[settings]
master_volume=1.0
music_volume=0.75
sfx_volume=0.75
ambience_volume=0.75
window_mode=0
vsync=true
max_fps=30
force_aspect_ratio=false
low_performance_mode=true
flow_particles=false
dust_particles=false
resource_particles=false
tile_animations=false
bonus_animations=false
world_pause=true
popup_size=0.6
ui_scale=0.75
core_skin=0
static_background=true
language="en"
crt_intensity=0.0
hide_tile_borders=false
show_grid_always=false
danger_vignette=false
custom_cursor=true
edge_scrolling=1
atkinson_font=false
show_tile_examples=true
touch_controls=false
show_hovers=true
advanced_resource_bar=false
haptics_enabled=false
haptics_intensity=1.0
screen_shake_enabled=false
screen_shake_intensity=1.0
`;

	const GODOT_CONFIG = {
		args: ["--max-fps", "30"],
		canvas: document.getElementById("canvas"),
		canvasResizePolicy: 0,
		emscriptenPoolSize: 4,
		ensureCrossOriginIsolationHeaders: false,
		executable: L.executable,
		experimentalVK: false,
		fileSizes: {},
		focusCanvas: true,
		gdextensionLibs: [],
		godotPoolSize: 2,
		serviceWorker: "",
	};
	GODOT_CONFIG.fileSizes[BASE + "index.pck"] = PCK_BYTES;
	GODOT_CONFIG.fileSizes[BASE + "index.wasm"] = WASM_BYTES;
	GODOT_CONFIG.fileSizes[BASE + "index.side.wasm"] = SIDE_WASM_BYTES;
	if (!BASE) {
		GODOT_CONFIG.fileSizes["index.pck"] = PCK_BYTES;
		GODOT_CONFIG.fileSizes["index.wasm"] = WASM_BYTES;
		GODOT_CONFIG.fileSizes["index.side.wasm"] = SIDE_WASM_BYTES;
	}

	const nativeFetch = window.fetch.bind(window);
	const mergedBlobs = {};

	function mb(n) {
		return (n / 1048576).toFixed(1);
	}

	function requestUrl(input) {
		if (typeof input === "string") return input;
		if (input instanceof URL) return input.href;
		if (input && input.url) return input.url;
		return "";
	}

	function startCappedGame(override) {
		engine.config.update(override);
		const exe = engine.config.executable;
		const pack = engine.config.mainPack || (exe + ".pck");
		engine.config.args = ["--main-pack", pack, "--max-fps", "30"];
		return Promise.all([
			engine.init(exe),
			engine.preloadFile(pack, pack),
		]).then(function () {
			const buf = new TextEncoder().encode(WEB_SETTINGS).buffer;
			try { engine.copyToFS("/userfs/settings.cfg", buf); } catch (err) {}
			try { engine.copyToFS("user://settings.cfg", buf); } catch (err) {}
			return engine.start();
		});
	}

	let downloaded = 0;
	let lastPct = 0;
	let phase = "download";

	function bump(n) {
		downloaded += n;
		paint();
	}

	function paint(forcePct, labelText) {
		const fill = document.getElementById("status-fill");
		const percent = document.getElementById("status-percent");
		const label = document.getElementById("status-label");
		if (!fill || !percent || !label) return;
		let pct;
		if (typeof forcePct === "number") {
			pct = forcePct;
		} else {
			pct = Math.floor((downloaded / TOTAL_BYTES) * 100);
		}
		pct = Math.max(lastPct, Math.min(100, pct));
		lastPct = pct;
		fill.style.width = pct + "%";
		percent.textContent = pct + "%";
		if (labelText) {
			label.textContent = labelText;
		} else if (phase === "start") {
			label.textContent = "Starting VENA…";
		} else {
			label.textContent = "Loading  " + pct + "%  ·  " + mb(Math.min(downloaded, TOTAL_BYTES)) + " / " + mb(TOTAL_BYTES) + " MB";
		}
	}

	async function fetchTracked(url) {
		const response = await nativeFetch(url);
		if (!response.ok) {
			throw new Error("Failed loading file '" + url + "'");
		}
		if (!response.body || !response.body.getReader) {
			const buf = await response.arrayBuffer();
			bump(buf.byteLength);
			return buf;
		}
		const reader = response.body.getReader();
		const chunks = [];
		let len = 0;
		for (;;) {
			const step = await reader.read();
			if (step.done) break;
			chunks.push(step.value);
			len += step.value.byteLength;
			bump(step.value.byteLength);
		}
		const out = new Uint8Array(len);
		let off = 0;
		for (let i = 0; i < chunks.length; i++) {
			out.set(chunks[i], off);
			off += chunks[i].byteLength;
		}
		return out.buffer;
	}

	async function mergeParts(base, count, expected, mime) {
		const buffers = await Promise.all(Array.from({ length: count }, function (_, i) {
			return fetchTracked(base + ".part" + (i + 1));
		}));
		let loaded = 0;
		for (let i = 0; i < buffers.length; i++) {
			loaded += buffers[i].byteLength;
		}
		if (loaded !== expected) {
			throw new Error("Size mismatch for " + base + " (" + loaded + " != " + expected + ")");
		}
		return new Blob(buffers, { type: mime });
	}

	function blobResponse(key, factory) {
		mergedBlobs[key] = mergedBlobs[key] || factory();
		return mergedBlobs[key].then(function (blob) {
			return new Response(blob, {
				headers: { "Content-Type": blob.type || "application/octet-stream" },
			});
		});
	}

	function patchedFetch(input, init) {
		const url = requestUrl(input);
		if (url.includes("index.pck") && !url.includes(".part")) {
			return blobResponse("pck", function () {
				return mergeParts(BASE + "index.pck", PCK_PARTS, PCK_BYTES, "application/octet-stream");
			});
		}
		if (url.includes("index.side.wasm") && !url.includes(".part")) {
			return blobResponse("side", function () {
				return mergeParts(BASE + "index.side.wasm", SIDE_WASM_PARTS, SIDE_WASM_BYTES, "application/wasm");
			});
		}
		if (url.includes("index.wasm") && !url.includes("side") && !url.includes(".part")) {
			return blobResponse("wasm", function () {
				return fetchTracked(BASE + "index.wasm").then(function (buf) {
					return new Blob([buf], { type: "application/wasm" });
				});
			});
		}
		return nativeFetch(input, init);
	}
	window.fetch = patchedFetch;

	if (typeof Engine === "undefined") {
		window.addEventListener("DOMContentLoaded", function () {
			const notice = document.getElementById("status-notice");
			const overlay = document.getElementById("status");
			if (notice && overlay) {
				overlay.style.visibility = "visible";
				notice.style.display = "block";
				notice.textContent = "Godot engine script failed to load.";
			}
		});
		return;
	}

	const engine = new Engine(GODOT_CONFIG);
	window.VENA_ENGINE = engine;

	if (navigator.storage && navigator.storage.persist) {
		navigator.storage.persist().catch(function () {});
	}

	(function boot() {
		const statusOverlay = document.getElementById("status");
		const statusProgress = document.getElementById("status-progress");
		const statusNotice = document.getElementById("status-notice");
		const fpsGraph = document.getElementById("fps-graph");
		const fpsCanvas = document.getElementById("fps-canvas");

		let initializing = true;
		let statusMode = "";

		function setStatusMode(mode) {
			if (statusMode === mode || !initializing) {
				return;
			}
			if (mode === "hidden") {
				statusOverlay.remove();
				initializing = false;
				startFps();
				return;
			}
			statusOverlay.style.visibility = "visible";
			statusProgress.style.display = mode === "progress" ? "flex" : "none";
			statusNotice.style.display = mode === "notice" ? "block" : "none";
			statusMode = mode;
		}

		function setStatusNotice(text) {
			statusNotice.textContent = "";
			text.split("\n").forEach(function (line) {
				statusNotice.appendChild(document.createTextNode(line));
				statusNotice.appendChild(document.createElement("br"));
			});
		}

		function displayFailureNotice(err) {
			console.error(err);
			if (err instanceof Error) {
				setStatusNotice(err.message);
			} else if (typeof err === "string") {
				setStatusNotice(err);
			} else {
				setStatusNotice("An unknown error occurred.");
			}
			setStatusMode("notice");
			initializing = false;
		}

		function startFps() {
			if (!fpsCanvas || !fpsGraph) return;
			const ctx = fpsCanvas.getContext("2d");
			const hist = [];
			let last = performance.now();
			let frames = 0;
			function tick(now) {
				frames++;
				const fps = 1000 / Math.max(now - last, 1);
				last = now;
				if (frames % 2 === 0) {
					hist.push(fps);
					if (hist.length > 74) hist.shift();
					ctx.clearRect(0, 0, 148, 44);
					for (let i = 0; i < hist.length; i++) {
						const f = hist[i];
						const h = Math.min(f / 30, 1) * 28;
						ctx.fillStyle = f > 26 ? "#6f6" : f > 20 ? "#fa3" : "#f44";
						ctx.fillRect(i * 2, 44 - h, 1.7, h);
					}
					ctx.fillStyle = "#fff";
					ctx.font = "bold 12px monospace";
					ctx.fillText(Math.round(fps) + " FPS", 6, 14);
				}
				requestAnimationFrame(tick);
			}
			fpsGraph.style.display = "block";
			requestAnimationFrame(tick);
		}

		const gameCanvas = document.getElementById("canvas");
		gameCanvas.width = RENDER_CAP.w;
		gameCanvas.height = RENDER_CAP.h;

		const missing = Engine.getMissingFeatures({ threads: false });
		if (missing.length !== 0) {
			displayFailureNotice("Missing browser features:\n" + missing.join("\n"));
			return;
		}

		setStatusMode("progress");
		paint(0);
		mergedBlobs.pck = mergeParts(BASE + "index.pck", PCK_PARTS, PCK_BYTES, "application/octet-stream");
		mergedBlobs.side = mergeParts(BASE + "index.side.wasm", SIDE_WASM_PARTS, SIDE_WASM_BYTES, "application/wasm");
		mergedBlobs.wasm = fetchTracked(BASE + "index.wasm").then(function (buf) {
			return new Blob([buf], { type: "application/wasm" });
		});

		Promise.all([mergedBlobs.pck, mergedBlobs.side, mergedBlobs.wasm]).then(function () {
			phase = "start";
			paint(100, "Starting VENA…");
		}).catch(displayFailureNotice);

		startCappedGame({
			onProgress: function (current, total) {
				if (phase === "start") {
					paint(100, "Starting VENA…");
					return;
				}
				if (current > 0 && total > 0) {
					paint();
				}
			},
		}).then(function () { setStatusMode("hidden"); }, displayFailureNotice);
	}());
}());
