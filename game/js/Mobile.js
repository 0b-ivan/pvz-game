(() => {
	const GAME_WIDTH = 900;
	const GAME_HEIGHT = 600;
	const MIN_SCALE = 0.35;

	const isTouchCapable = () => navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;

	const getViewportSize = () => {
		const viewport = window.visualViewport;
		return {
			width: viewport?.width || window.innerWidth,
			height: viewport?.height || window.innerHeight,
		};
	};

	const resetViewport = () => {
		const body = document.body;
		body.style.zoom = "";
		body.style.width = "";
		body.style.height = "";
		body.style.minHeight = "";
		body.style.position = "";
		body.style.left = "";
		body.style.top = "";
		body.style.margin = "";
		body.style.padding = "";
		body.classList.remove("pvz-touch", "pvz-portrait");
	};

	const updateViewport = () => {
		if (!isTouchCapable()) {
			resetViewport();
			return;
		}

		const body = document.body;
		const viewport = getViewportSize();
		const isPortrait = viewport.height > viewport.width;

		body.classList.add("pvz-touch");
		body.classList.toggle("pvz-portrait", isPortrait);

		const widthScale = viewport.width / GAME_WIDTH;
		const heightScale = viewport.height / GAME_HEIGHT;
		const scale = Math.max(MIN_SCALE, Math.min(1, widthScale, heightScale));

		/*
		 * Keep the legacy game in its native 900x600 coordinate system.
		 * CSS zoom is retained because the game engine already compensates
		 * pointer coordinates for document.body.style.zoom.
		 *
		 * Safari's layout viewport and visual viewport can differ while the
		 * browser chrome is visible. Positioning the scaled stage explicitly
		 * avoids the old 50vw/50vh centering drifting to the left on iPhone.
		 */
		const layoutWidth = viewport.width / scale;
		const layoutHeight = viewport.height / scale;
		const left = Math.max(0, (layoutWidth - GAME_WIDTH) / 2);
		const top = Math.max(0, (layoutHeight - GAME_HEIGHT) / 2);

		body.style.width = `${GAME_WIDTH}px`;
		body.style.height = `${GAME_HEIGHT}px`;
		body.style.minHeight = `${GAME_HEIGHT}px`;
		body.style.position = "fixed";
		body.style.left = `${left}px`;
		body.style.top = `${top}px`;
		body.style.margin = "0";
		body.style.padding = "0";

		// Set zoom last so positioning values stay in the native coordinate space.
		body.style.zoom = String(scale);
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
		window.visualViewport?.addEventListener("resize", updateViewport, { passive: true });
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
