(() => {
	const GAME_WIDTH = 900;
	const GAME_HEIGHT = 600;

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
		for (const property of ["--pvz-stage-left", "--pvz-stage-top", "--pvz-safe-right", "--pvz-menu-left", "--pvz-menu-width", "--pvz-menu-shift"]) {
			body.style.removeProperty(property);
		}
		body.classList.remove("pvz-touch", "pvz-portrait");
		document.documentElement.classList.remove("pvz-touch");
		globalThis.UpdateGameStageOffset?.();
	};

	const updateViewport = () => {
		if (!isTouchCapable() && !isStandalone() && !getFullscreenElement()) {
			resetViewport();
			return;
		}

		const body = document.body;
		const viewport = getViewportSize();
		const isPortrait = viewport.height > viewport.width;

		body.classList.add("pvz-touch");
		document.documentElement.classList.add("pvz-touch");
		body.classList.toggle("pvz-portrait", isPortrait);

		const styles = getComputedStyle(body);
		const inset = (side) => parseFloat(styles.getPropertyValue(`--pvz-inset-${side}`)) || 0;
		const safeWidth = Math.max(1, viewport.width - inset("left") - inset("right"));
		const safeHeight = Math.max(1, viewport.height - inset("top") - inset("bottom"));
		const scale = Math.min(safeWidth / GAME_WIDTH, safeHeight / GAME_HEIGHT);

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
		const extra = (safeWidth / scale - GAME_WIDTH) / 2;
		const stageLeft = inset("left") / scale + (body.classList.contains("pvz-gameplay") ? Math.min(115, extra) : extra);
		body.style.setProperty("--pvz-stage-left", `${stageLeft}px`);
		body.style.setProperty("--pvz-stage-top", `${(inset("top") + (safeHeight - GAME_HEIGHT * scale) / 2) / scale}px`);
		body.style.setProperty("--pvz-safe-right", `${inset("right") / scale}px`);
		body.style.setProperty("--pvz-menu-left", `${inset("left") / scale}px`);
		body.style.setProperty("--pvz-menu-width", `${safeWidth / scale}px`);
		body.style.setProperty("--pvz-menu-shift", `${(safeWidth / scale - GAME_WIDTH) / 2}px`);

		// Set zoom last so pointer compensation keeps using the native game scale.
		body.style.zoom = String(scale);
		document.documentElement.style.setProperty("--pvz-scale", String(scale));
		document.documentElement.style.setProperty("--pvz-screen-stage-left", `${stageLeft * scale}px`);
		document.documentElement.style.setProperty("--pvz-screen-stage-top", `${(inset("top") + (safeHeight - GAME_HEIGHT * scale) / 2)}px`);
		globalThis.UpdateGameStageOffset?.();
	};

	const createSceneBackdrop = () => {
		// Copy background artwork only, never the live board, buttons or sprites.
		const backdrop = document.createElement("div");
		backdrop.id = "pvz-scene-backdrop";
		backdrop.setAttribute("aria-hidden", "true");
		const artwork = document.createElement("div");
		backdrop.appendChild(artwork);
		document.documentElement.appendChild(backdrop);
		const teachBar = document.createElement("div");
		teachBar.id = "pvz-viewport-teach-bar";
		teachBar.setAttribute("aria-hidden", "true");
		teachBar.hidden = true;
		document.body.appendChild(teachBar);

		const visible = (element) => {
			if (!element || getComputedStyle(element).visibility === "hidden") return false;
			for (let node = element; node && node !== document.body; node = node.parentElement) {
				if (getComputedStyle(node).display === "none") return false;
			}
			return true;
		};
		const sceneIds = ["dHandBookPZ", "dHandBook", "dMiniSmallContainer", "dRiddleSmallContainer", "dAdvSmallContainer", "iSurfaceBackground", "tGround"];
		let previousImage = "";
		const sync = () => {
			const sourceTeachBar = document.getElementById("DivTeachBar");
			const teaching = sourceTeachBar?.textContent || "";
			teachBar.hidden = !teaching || !visible(sourceTeachBar);
			if (teachBar.textContent !== teaching) teachBar.textContent = teaching;
			let image = "";
			let currentScene;
			for (const id of sceneIds) {
				const scene = document.getElementById(id);
				if (!visible(scene)) continue;
				image = getComputedStyle(scene).backgroundImage;
				if (image === "none") {
					const source = scene.querySelector(":scope > img");
					image = source ? `url(${JSON.stringify(source.currentSrc || source.src)})` : "";
				}
				if (image && image !== "none") {
					currentScene = scene;
					break;
				}
			}
			const isGame = currentScene?.id === "tGround" && globalThis.oS?.Lvl !== 0;
			const isSelector = currentScene?.id === "iSurfaceBackground";
			document.documentElement.classList.toggle("pvz-selector", isSelector);
			if (document.body.classList.contains("pvz-gameplay") !== isGame) {
				document.body.classList.toggle("pvz-gameplay", isGame);
				updateViewport();
			}
			if (document.body.classList.contains("pvz-selector") !== isSelector) {
				document.body.classList.toggle("pvz-selector", isSelector);
				requestAnimationFrame(sync);
			}
			artwork.classList.toggle("pvz-game-panorama", isGame);
			if (isGame) {
				const stage = document.getElementById("dAll");
				const styles = getComputedStyle(currentScene);
				const translation = styles.transform === "none" ? 0 : new DOMMatrix(styles.transform).m41;
				artwork.style.setProperty("--pvz-panorama-offset", `${(parseFloat(styles.left) || 0) + translation - stage.scrollLeft}px`);
			}
			if (isSelector) image = 'url("images/interface/SelectorLandscape-v1.png")';
			image = image === "none" ? "" : image;
			if (image !== previousImage) {
				artwork.style.backgroundImage = image;
				backdrop.style.backgroundImage = image;
				previousImage = image;
			}
		};
		let scheduled = false;
		const schedule = () => {
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(() => {
				scheduled = false;
				sync();
			});
		};
		const observer = new MutationObserver((mutations) => {
			if (mutations.some((mutation) => mutation.type === "childList")) watchScenes();
			schedule();
		});
		// Ignore animation mutations from plants, zombies, sun and particles.
		const watchScenes = () => {
			observer.disconnect();
			observer.observe(document.body, { childList: true });
			const stage = document.getElementById("dAll");
			const sourceTeachBar = document.getElementById("DivTeachBar");
			if (sourceTeachBar)
				observer.observe(sourceTeachBar, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["style"] });
			const watched = new Set();
			for (const id of sceneIds) {
				for (let node = document.getElementById(id); node && node !== document.body; node = node.parentElement) {
					if (watched.has(node)) continue;
					watched.add(node);
					observer.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
				}
			}
			if (stage) observer.observe(stage, { childList: true, attributes: true, attributeFilter: ["style", "class"] });
		};
		document.body.addEventListener("scroll", schedule, { capture: true, passive: true });
		watchScenes();
		sync();
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

		const world = document.createElement("div");
		world.id = "pvz-menu-world";
		world.setAttribute("aria-hidden", "true");
		world.innerHTML =
			'<div class="pvz-menu-zombie"><img src="images/interface/SelectorZombie.svg" alt="" width="180" height="230"></div>' +
			'<div class="pvz-menu-stone"></div>' +
			'<div class="pvz-menu-leaves">' +
			Array.from(
				{ length: 7 },
				(_, index) =>
					`<svg class="pvz-menu-leaf" style="--leaf:${index}" viewBox="0 0 40 48">` +
					'<path d="M20 43C-6 30 3 8 31 3C43 20 40 35 20 43Z" fill="#8cc832" stroke="#41651d" stroke-width="2"/>' +
					'<path d="M17 47L29 9M22 31L10 21M25 22L35 17" fill="none" stroke="#567e21" stroke-width="2"/>' +
					"</svg>"
			).join("") +
			"</div>";
		surface.prepend(world);

		const help = document.createElement("div");
		help.id = "pvz-fullscreen-help";
		help.setAttribute("role", "dialog");
		help.setAttribute("aria-modal", "true");
		help.setAttribute("aria-labelledby", "pvz-fullscreen-help-title");
		help.innerHTML =
			'<div class="pvz-fullscreen-card">' +
			'<strong id="pvz-fullscreen-help-title">Fullscreen on iPhone</strong>' +
			"<p>Tap <b>Share</b>, choose <b>Add to Home Screen</b>, then open PVZ from the Home Screen.</p>" +
			'<button type="button" id="pvz-fullscreen-help-close">Close</button>' +
			"</div>";

		const closeHelp = () => {
			help.style.display = "none";
		};

		const showHelp = () => {
			const title = help.querySelector("#pvz-fullscreen-help-title");
			const paragraph = help.querySelector("p");
			if (!isIPhone()) {
				if (title) {
					title.textContent = "Fullscreen unavailable";
				}
				if (paragraph) {
					paragraph.textContent = "This browser cannot enter fullscreen here. Install PVZ as a web app for the cleanest app-like view.";
				}
			}
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

			try {
				const requested = await requestNativeFullscreen();
				if (requested) {
					return;
				}
			} catch {
				// Fall through to the install/help experience below.
			}

			// iPhone Safari currently has no reliable page-level Fullscreen API.
			// Prefer capability detection above so this automatically improves
			// if WebKit adds support later.
			showHelp();
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
		window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncFullscreenState);
		window.matchMedia("(display-mode: fullscreen)").addEventListener?.("change", syncFullscreenState);
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
		createSceneBackdrop();
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
