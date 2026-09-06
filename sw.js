const CACHE = "vena-steam-demo-v5";
const PRECACHE = [
	"./index.html",
	"./index.js",
	"./index.wasm",
	"./index.png",
	"./index.icon.png",
	"./index.apple-touch-icon.png",
	"./index.audio.worklet.js",
	"./index.audio.position.worklet.js",
	"./vena-boot.js",
	"./play.html",
	"./vena.html",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
		).then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	event.respondWith(
		caches.match(event.request).then((cached) => {
			if (cached) return cached;
			return fetch(event.request).then((resp) => {
				if (resp.ok) {
					const copy = resp.clone();
					caches.open(CACHE).then((cache) => cache.put(event.request, copy));
				}
				return resp;
			});
		})
	);
});
