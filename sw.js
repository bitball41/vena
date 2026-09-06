const CACHE = "vena-steam-demo-v7";
const PRECACHE = [
	"./index.html",
	"./vena.html",
	"./vena-boot.js",
	"./packages/index.js",
	"./packages/index.wasm",
	"./assets/index.png",
	"./assets/index.icon.png",
	"./assets/index.apple-touch-icon.png",
	"./packages/index.audio.worklet.js",
	"./packages/index.audio.position.worklet.js",
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
