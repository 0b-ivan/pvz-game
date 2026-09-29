(() => {
	const GAME_WIDTH = 900;
	const GAME_HEIGHT = 600;
	const MIN_SCALE = 0.35;

	const isTouchCapable = () => navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;

	const isStandalone = () =>
		window.matchMedia("(display-mode: standalone)").matches ||
		window.matchMedia("(display-mode: fullscreen)").matches ||
		window.navigator.standalone === true;

	const isIPhone = () => /iPhone|iPod/.test(navigator.userAgent);

	const getFullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;

	const requestNativeFullscreen = async () => {
		const root = document.documentElement;
		if (root.requestFullscreen) {
			await root.requestFullscreen();
			return true;
		}
		if (root.webkitRequestFullscreen) {
			root.webkitRequestFullscreen();
			return true;
		}
		return false;
	};

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

		/*
		 * Make the body represent the full unscaled visual viewport instead of
		 * trying to move the body itself. Safari applies CSS zoom to the body
		 * differently from Chromium, which caused the 900x600 stage to stick
		 * to the left edge on iPhone.
		 *
		 * Child frames are centered inside this virtual viewport via mobile.css.
		 */
		body.style.width = `${layoutWidth}px`;
		body.style.height = `${layoutHeight}px`;
		body.style.minHeight = `${layoutHeight}px`;
		body.style.position = "relative";
		body.style.left = "0";
		body.style.top = "0";
		body.style.margin = "0";
		body.style.padding = "0";

		// Set zoom last so pointer compensation keeps using the native game scale.
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

	const createFullscreenExperience = () => {
		const surface = document.getElementById("iSurfaceBackground");
		const surfaceFrame = document.getElementById("dSurface");
		if (!surface || !surfaceFrame || document.getElementById("pvz-fullscreen-button")) {
			return;
		}

		const button = document.createElement("button");
		button.id = "pvz-fullscreen-button";
		button.type = "button";
		button.setAttribute("aria-label", "Fullscreen");
		button.setAttribute("title", "Fullscreen");
		button.textContent = "⛶";

		const help = document.createElement("div");
		help.id = "pvz-fullscreen-help";
		help.setAttribute("role", "dialog");
		help.setAttribute("aria-modal", "true");
		help.setAttribute("aria-labelledby", "pvz-fullscreen-help-title");
		help.innerHTML =
			'<div class="pvz-fullscreen-card">' +
			'<strong id="pvz-fullscreen-help-title">Fullscreen on iPhone</strong>' +
			'<p>Tap <b>Share</b>, choose <b>Add to Home Screen</b>, then open PVZ from the Home Screen.</p>' +
			'<button type="button" id="pvz-fullscreen-help-close">Close</button>' +
			'</div>';

		const closeHelp = () => {
			help.style.display = "none";
		};

		const showHelp = () => {
			help.style.display = "flex";
		};

		const syncButton = () => {
			button.hidden = isStandalone();
			button.setAttribute("aria-pressed", getFullscreenElement() ? "true" : "false");
		};

		button.addEventListener("click", async () => {
			if (isStandalone()) {
				syncButton();
				return;
			}

			if (getFullscreenElement()) {
				if (document.exitFullscreen) {
					await document.exitFullscreen();
				} else if (document.webkitExitFullscreen) {
					document.webkitExitFullscreen();
				}
				return;
			}

			// iPhone Safari does not expose reliable page fullscreen. The
			// installed web app is the stable fullscreen-like experience.
			if (isIPhone()) {
				showHelp();
				return;
			}

			try {
				const requested = await requestNativeFullscreen();
				if (!requested) {
					showHelp();
				}
			} catch {
				showHelp();
			}
		});

		help.addEventListener("click", (event) => {
			if (event.target === help) {
				closeHelp();
			}
		});

		surface.appendChild(button);
		surfaceFrame.appendChild(help);
		help.querySelector("#pvz-fullscreen-help-close")?.addEventListener("click", closeHelp);

		const syncFullscreenState = () => {
			syncButton();
			updateViewport();
		};

		document.addEventListener("fullscreenchange", syncFullscreenState);
		document.addEventListener("webkitfullscreenchange", syncFullscreenState);
		window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncButton);
		window.matchMedia("(display-mode: fullscreen)").addEventListener?.("change", syncButton);
		syncButton();
	};

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
		createFullscreenExperience();
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
