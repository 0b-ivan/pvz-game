const CACHE_VERSION = "pvz-foundation-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
	"/game/",
	"/game/index.html",
	"/game/UI.css",
	"/game/Custom.css",
	"/game/mobile.css",
	"/game/js/StorageUtil.js",
	"/game/js/Cfunction.js",
	"/game/js/Welcome.js",
	"/game/js/Menus.js",
	"/game/js/Custom.js",
	"/game/js/Mobile.js",
	"/game/js/CPlants.js",
	"/game/js/CZombie.js",
	"/game/js/IZombie.js",
	"/app.webmanifest",
];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys.filter((key) => key.startsWith("pvz-foundation-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) {
		return;
	}

	if (url.pathname === "/runtime-config.js") {
		event.respondWith(fetch(request, { cache: "no-store" }));
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					const copy = response.clone();
					caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
					return response;
				})
				.catch(async () => (await caches.match(request)) || caches.match("/game/index.html"))
		);
		return;
	}

	event.respondWith(
		caches.match(request).then((cached) => {
			const network = fetch(request)
				.then((response) => {
					if (response.ok) {
						const copy = response.clone();
						caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
					}
					return response;
				})
				.catch(() => cached);

			return cached || network;
		})
	);
});
