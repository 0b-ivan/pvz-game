(() => {
	const GAME_WIDTH = 900;
	const GAME_HEIGHT = 600;
	const MIN_SCALE = 0.35;

	const isTouchCapable = () => navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;

	const updateViewport = () => {
		if (!isTouchCapable()) {
			document.body.style.zoom = "";
			document.body.classList.remove("pvz-touch", "pvz-portrait");
			return;
		}

		document.body.classList.add("pvz-touch");
		document.body.classList.toggle("pvz-portrait", window.innerHeight > window.innerWidth);

		const widthScale = window.innerWidth / GAME_WIDTH;
		const heightScale = window.innerHeight / GAME_HEIGHT;
		const scale = Math.max(MIN_SCALE, Math.min(1, widthScale, heightScale));

		// The game engine already divides pointer coordinates by body.style.zoom.
		document.body.style.zoom = String(scale);
	};

	const createOrientationHint = () => {
		if (document.getElementById("pvz-orientation-hint")) {
			return;
		}

		const hint = document.createElement("div");
		hint.id = "pvz-orientation-hint";
		hint.setAttribute("role", "status");
		hint.innerHTML = "<div><strong>Rotate your device</strong>Plants vs. Zombies is designed for landscape mode.</div>";
		document.body.appendChild(hint);
	};

	const legacyPointerEvent = (event) => ({
		clientX: event.clientX,
		clientY: event.clientY,
		button: 0,
		which: 1,
		target: event.target,
		preventDefault: () => event.preventDefault(),
		stopPropagation: () => event.stopPropagation(),
	});

	const installTouchBridge = () => {
		const game = document.getElementById("dAll");
		if (!game || !isTouchCapable()) {
			return;
		}

		game.addEventListener(
			"pointermove",
			(event) => {
				if (event.pointerType === "mouse" || !globalThis.oS?.Chose) {
					return;
				}

				event.preventDefault();
				if (typeof globalThis.GroundOnmousemove === "function") {
					globalThis.GroundOnmousemove(legacyPointerEvent(event));
				}
			},
			{ passive: false }
		);

		game.addEventListener(
			"pointerdown",
			(event) => {
				if (event.pointerType === "mouse") {
					return;
				}

				if (event.target?.id === "imgShovel" && typeof globalThis.ChoseShovel === "function") {
					event.preventDefault();
					globalThis.ChoseShovel(legacyPointerEvent(event));
					return;
				}

				// Normal buttons/cards keep their native click behavior. We only
				// intercept the board after a plant or shovel has been selected.
				if (!globalThis.oS?.Chose || typeof globalThis.GroundOnmousedown !== "function") {
					return;
				}

				event.preventDefault();
				globalThis.GroundOnmousedown(legacyPointerEvent(event));
			},
			{ passive: false }
		);
	};

	const registerServiceWorker = () => {
		if (!("serviceWorker" in navigator)) {
			return;
		}

		if (location.protocol !== "https:" && location.hostname !== "localhost") {
			return;
		}

		navigator.serviceWorker.register("/service-worker.js").catch((error) => {
			console.warn("Service worker registration failed:", error);
		});
	};

	const init = () => {
		createOrientationHint();
		updateViewport();
		installTouchBridge();
		registerServiceWorker();

		window.addEventListener("resize", updateViewport, { passive: true });
		window.addEventListener("orientationchange", updateViewport, { passive: true });
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
