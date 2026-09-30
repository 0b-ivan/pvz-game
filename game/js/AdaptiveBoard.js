/* Responsive presentation of the live board. Simulation coordinates stay native;
 * artwork, entities and pointer input share the same piecewise projection. */
(() => {
	const axis = (start, end, size, nativeSize) => {
		const factor = (size - start - (nativeSize - end)) / (end - start);
		return {
			map: (value) => (value < start ? value : value <= end ? start + (value - start) * factor : size - nativeSize + value),
			unmap: (value) => (value < start ? value : value <= size - nativeSize + end ? start + (value - start) / factor : value - size + nativeSize),
		};
	};
	let stage,
		scene,
		spacer,
		cells,
		observer,
		active = false,
		width = 900,
		height = 600;
	let x = axis(140, 855, 900, 900),
		y = axis(85, 600, 600, 600);
	const shifted = new Set(),
		pending = new Set(),
		backgrounds = new Map();
	let frame = 0,
		lastScene = "",
		lastGrid = "";
	const enabled = () => document.body.classList.contains("pvz-touch") && document.body.classList.contains("pvz-gameplay");
	const nativePoint = (point) => (enabled() ? { x: x.unmap(point.x), y: y.unmap(point.y) } : point);
	const viewPoint = (point) => (enabled() ? { x: x.map(point.x), y: y.map(point.y) } : point);
	const prepareSunCollection = (element, sun, destX, destY) => {
		if (!enabled()) return false;
		const halfWidth = element.offsetWidth / 2,
			halfHeight = element.offsetHeight / 2;
		const start = viewPoint({ x: sun.left + (sun.offsetX || 0) + halfWidth, y: sun.top + (sun.offsetY || 0) + halfHeight });
		const end = viewPoint({ x: destX + halfWidth, y: destY + halfHeight });
		element.style.transform = "";
		element.style.setProperty("--sun-start", `${start.x - sun.left - halfWidth}px ${start.y - sun.top - halfHeight}px`);
		element.style.setProperty("--sun-end", `${end.x - sun.left - halfWidth}px ${end.y - sun.top - halfHeight}px`);
		return true;
	};
	const rootFor = (element) => {
		let node = element;
		while (node?.parentElement && node.parentElement !== stage && !["dPZ", "dZombie"].includes(node.parentElement.id)) node = node.parentElement;
		return node?.parentElement && node !== stage ? node : null;
	};
	const ignored = (element) => ["tGround", "dPZ", "dZombie", "pvz-adaptive-scene", "pvz-adaptive-spacer", "pvz-board-cells"].includes(element.id);
	const render = (element) => {
		if (!active || !element.isConnected || ignored(element) || element.classList.contains("sun-collect")) return;
		if (element.style.backgroundImage.includes("/background")) {
			if (!backgrounds.has(element)) {
				const layer = document.createElement("div");
				layer.className = "pvz-native-overlay";
				makeTiles(layer);
				scene.appendChild(layer);
				backgrounds.set(element, layer);
				element.dataset.pvzBackgroundSource = "";
			}
			return;
		}
		const scroll = stage.scrollLeft;
		const left = element.offsetLeft,
			top = element.offsetTop;
		const plant = globalThis.$P?.[element.id],
			zombie = globalThis.$Z?.[element.id];
		const anchorX = plant ? GetX(plant.C) : zombie ? (zombie.AttackedLX + zombie.AttackedRX) / 2 : left + element.offsetWidth / 2;
		const anchorY = plant ? GetY(plant.R) : zombie ? GetY(zombie.R) : top + element.offsetHeight / 2;
		// dZombie preview children are positioned in a parent at native x=1065.
		const parentX = element.parentElement.id === "dZombie" ? element.parentElement.offsetLeft : 0;
		const transform = element.style.transform ? new DOMMatrix(getComputedStyle(element).transform) : null;
		const offsetX = transform?.m41 || 0,
			offsetY = transform?.m42 || 0;
		const dx = x.map(anchorX + parentX + offsetX - scroll) + scroll - anchorX - parentX - offsetX;
		const dy = y.map(anchorY + offsetY) - anchorY - offsetY;
		const translate = `${dx}px ${dy}px`;
		if (element.style.translate !== translate) element.style.translate = translate;
		shifted.add(element);
	};
	const roots = () => [...stage.children, ...document.getElementById("dPZ").children, ...document.getElementById("dZombie").children];
	const makeTiles = (parent) => {
		for (let i = 0; i < 6; i++) {
			const tile = document.createElement("div");
			tile.className = "pvz-art-tile";
			tile.appendChild(document.createElement("div"));
			parent.appendChild(tile);
		}
	};
	const paintLayer = (layer, image, offset) => {
		const columns = [0, 140, 855, 900],
			rows = [0, 85, 600];
		let index = 0;
		const tiles = [...layer.children].filter((child) => child.classList.contains("pvz-art-tile"));
		for (let r = 0; r < 2; r++)
			for (let c = 0; c < 3; c++) {
				const tile = tiles[index++],
					art = tile.firstElementChild;
				const left = x.map(columns[c]),
					top = y.map(rows[r]);
				const tileWidth = x.map(columns[c + 1]) - left,
					tileHeight = y.map(rows[r + 1]) - top;
				Object.assign(tile.style, { left: `${left}px`, top: `${top}px`, width: `${tileWidth}px`, height: `${tileHeight}px` });
				Object.assign(art.style, {
					backgroundImage: image,
					backgroundPosition: `${offset - columns[c]}px ${-rows[r]}px`,
					transform: `scale(${tileWidth / (columns[c + 1] - columns[c])}, ${tileHeight / (rows[r + 1] - rows[r])})`,
				});
			}
	};
	const paintScene = () => {
		const ground = document.getElementById("tGround"),
			styles = getComputedStyle(ground);
		const transform = styles.transform === "none" ? 0 : new DOMMatrix(styles.transform).m41;
		const offset = (parseFloat(styles.left) || 0) + transform - stage.scrollLeft;
		const image = styles.backgroundImage,
			key = `${image}|${offset}|${width}|${height}`;
		if (scene.style.left !== `${stage.scrollLeft}px`) scene.style.left = `${stage.scrollLeft}px`;
		if (key !== lastScene) {
			lastScene = key;
			paintLayer(scene, image, offset);
		}
		for (const [source, layer] of backgrounds) {
			if (!source.isConnected) {
				layer.remove();
				backgrounds.delete(source);
				continue;
			}
			const left = source.offsetLeft - stage.scrollLeft,
				end = left + source.offsetWidth;
			const clipping = `inset(0px ${Math.max(0, width - x.map(end))}px 0px ${Math.max(0, x.map(left))}px)`;
			const layerKey = `${source.style.backgroundImage}|${left}|${clipping}|${width}|${height}`;
			if (layer.dataset.paintKey !== layerKey) {
				layer.dataset.paintKey = layerKey;
				layer.style.clipPath = clipping;
				paintLayer(layer, source.style.backgroundImage, left);
			}
		}
	};
	const paintGrid = () => {
		if (!globalThis.GetX1X2 || !globalThis.GetY1Y2 || !oS.R) return;
		const key = `${oS.R}|${oS.C}|${width}|${height}`;
		if (key === lastGrid) return;
		lastGrid = key;
		cells.replaceChildren();
		for (let row = 1; row <= oS.R; row++)
			for (let column = 1; column <= oS.C; column++) {
				const [l, r] = GetX1X2(column),
					[t, b] = GetY1Y2(row),
					cell = document.createElement("div");
				cell.dataset.row = row;
				cell.dataset.column = column;
				Object.assign(cell.style, {
					left: `${x.map(l)}px`,
					top: `${y.map(t)}px`,
					width: `${x.map(r) - x.map(l)}px`,
					height: `${y.map(b) - y.map(t)}px`,
				});
				cells.appendChild(cell);
			}
	};
	const flush = () => {
		frame = 0;
		if (!active) return;
		for (const element of pending) render(element);
		paintScene();
		paintGrid();
		pending.clear();
		for (const element of shifted) if (!element.isConnected) shifted.delete(element);
	};
	const schedule = (all = false) => {
		if (all) for (const element of roots()) pending.add(element);
		if (!frame) frame = requestAnimationFrame(flush);
	};
	const resize = () => {
		if (stage && document.getElementById("dAll") !== stage) {
			scene = null;
			init();
			return;
		}
		if (!stage) return;
		const next = enabled();
		if (!next) {
			active = false;
			for (const element of shifted) element.style.translate = "";
			for (const [source, layer] of backgrounds) {
				delete source.dataset.pvzBackgroundSource;
				layer.remove();
			}
			backgrounds.clear();
			shifted.clear();
			pending.clear();
			lastScene = "";
			lastGrid = "";
			return;
		}
		active = true;
		width = parseFloat(document.body.style.getPropertyValue("--pvz-board-width")) || 900;
		height = parseFloat(document.body.style.getPropertyValue("--pvz-board-height")) || 600;
		x = axis(140, 855, width, 900);
		y = axis(85, 600, height, 600);
		spacer.style.width = `${width + 500}px`;
		schedule(true);
	};
	const init = () => {
		const current = document.getElementById("dAll");
		if (!current || (stage === current && scene)) return;
		observer?.disconnect();
		for (const element of shifted) element.style.translate = "";
		for (const [source, layer] of backgrounds) {
			delete source.dataset.pvzBackgroundSource;
			layer.remove();
		}
		backgrounds.clear();
		shifted.clear();
		pending.clear();
		lastScene = "";
		lastGrid = "";
		stage = current;
		for (const id of ["pvz-adaptive-scene", "pvz-adaptive-spacer", "pvz-board-cells"]) stage.querySelector(`#${id}`)?.remove();
		scene = document.createElement("div");
		scene.id = "pvz-adaptive-scene";
		scene.setAttribute("aria-hidden", "true");
		makeTiles(scene);
		spacer = document.createElement("div");
		spacer.id = "pvz-adaptive-spacer";
		cells = document.createElement("div");
		cells.id = "pvz-board-cells";
		cells.setAttribute("aria-hidden", "true");
		stage.prepend(scene, spacer, cells);
		observer = new MutationObserver((changes) => {
			if (!active) return;
			let dirty = false;
			for (const change of changes) {
				if (change.target.closest?.("#pvz-adaptive-scene, #pvz-adaptive-spacer, #pvz-board-cells")) continue;
				dirty = true;
				if (change.type === "childList")
					for (const node of change.addedNodes) {
						if (node.nodeType === 1) {
							const root = rootFor(node);
							if (root) pending.add(root);
						}
					}
				else {
					const root = rootFor(change.target);
					if (root) pending.add(root);
				}
			}
			if (dirty) schedule();
		});
		observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "src"] });
		stage.addEventListener("scroll", () => schedule(true), { passive: true });
		resize();
	};
	globalThis.PVZAdaptiveBoard = { init, resize, nativePoint, viewPoint, prepareSunCollection };
})();
