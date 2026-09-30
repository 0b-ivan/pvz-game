const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { createReadStream } = require("node:fs");
const { stat } = require("node:fs/promises");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const mime = {
	".svg": "image/svg+xml",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".webmanifest": "application/manifest+json",
};
const server = createServer(async (req, res) => {
	let file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
	if (!file.startsWith(root + path.sep)) {
		res.writeHead(403).end();
		return;
	}
	try {
		if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
		await stat(file);
		res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
		createReadStream(file).pipe(res);
	} catch {
		res.writeHead(404).end();
	}
});

async function openMenu(page, origin) {
	await page.goto(`${origin}/game/`);
	await page.getByText("Continue Here", { exact: true }).click();
	const play = page.getByText("PLAY!", { exact: true });
	if (await play.count()) await play.click();
	await page.waitForSelector("#dLogo");
	if (await page.evaluate(() => document.body.classList.contains("pvz-touch"))) {
		const intro = await page.locator("#dAll").boundingBox();
		const width = page.viewportSize().width;
		assert.ok(Math.abs(intro.x + intro.width / 2 - width / 2) < 1, "intro is centered");
	}
	await page.locator("#LogoWord > span").first().click();
	await page.waitForFunction(() => document.body.classList.contains("pvz-selector"));
}

async function checkLayout(page, width, height) {
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const layout = await page.evaluate(() => {
		const stage = document.getElementById("dAll").getBoundingClientRect();
		const backdrop = document.getElementById("pvz-scene-backdrop").getBoundingClientRect();
		const zoom = parseFloat(document.body.style.zoom);
		return { stage: stage.toJSON(), backdrop: backdrop.toJSON(), zoom, x: EDAlloffsetLeft * zoom, y: EDAlloffsetTop * zoom };
	});
	// Playwright's protocol reports physical bounds in both engines; WebKit's
	// DOM getBoundingClientRect reports pre-zoom CSS units instead.
	layout.stage = await page.locator("#dAll").boundingBox();
	layout.stage.left = layout.stage.x;
	layout.stage.top = layout.stage.y;
	layout.stage.right = layout.stage.x + layout.stage.width;
	layout.stage.bottom = layout.stage.y + layout.stage.height;
	layout.backdrop = await page.locator("#pvz-scene-backdrop").boundingBox();
	assert.ok(Math.abs(layout.stage.width / layout.stage.height - 1.5) < 0.002, "game proportions");
	assert.ok(
		layout.stage.left >= -1 && layout.stage.top >= -1 && layout.stage.right <= width + 1 && layout.stage.bottom <= height + 1,
		`entire board visible: ${JSON.stringify(layout)}`
	);
	assert.ok(Math.abs(layout.backdrop.width - width) < 1 && Math.abs(layout.backdrop.height - height) < 1, "scene fills viewport");
	assert.ok(Math.abs(layout.x - layout.stage.left) < 1 && Math.abs(layout.y - layout.stage.top) < 1, "pointer origin follows layout");
	return layout;
}

async function plantAt(page, column) {
	// Give this fixture enough sun; use real card selection and touch input.
	await page.evaluate(() => {
		oS.SunNum = 500;
		ESSunNum.innerHTML = "500";
		MonitorCard();
	});
	await page.waitForFunction(() => ArCard[0]?.CDReady && ArCard[0]?.SunReady);
	await page.locator("#dCardoPeashooter").tap();
	await page.waitForFunction(() => oS.Chose === 1);
	const cell = await page.evaluate((column) => {
		return { x: GetX(column), y: GetY(3) - 30 };
	}, column);
	const rect = await page.locator("#dAll").boundingBox();
	await page.touchscreen.tap(rect.x + (cell.x * rect.width) / 900, rect.y + (cell.y * rect.height) / 600);
	await page.waitForFunction((column) => Object.values($P).some((plant) => plant.EName === "oPeashooter" && plant.R === 3 && plant.C === column), column);
}

async function mobileTest(browserType, origin) {
	const browser = await browserType.launch();
	try {
		const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, deviceScaleFactor: 3 });
		// This suite checks layout and input, not media autoplay permissions.
		await page.addInitScript(() => {
			HTMLMediaElement.prototype.play = function () {
				return Promise.resolve();
			};
		});
		page.setDefaultTimeout(20000);
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
		page.on("dialog", (dialog) => dialog.dismiss());
		await openMenu(page, origin);
		await checkLayout(page, 844, 390);
		const selector = await page.locator("#dSurface").boundingBox();
		assert.ok(Math.abs(selector.width - 844) < 1, "main menu fills available width");
		const leaf = page.locator(".pvz-menu-leaf").first();
		const firstTransform = await leaf.evaluate((element) => getComputedStyle(element).transform);
		await page.waitForFunction((first) => getComputedStyle(document.querySelector(".pvz-menu-leaf")).transform !== first, firstTransform);
		assert.ok(await page.locator(".pvz-menu-zombie").isVisible(), "animated menu zombie visible");
		await page.waitForFunction(() => document.querySelector(".pvz-menu-zombie img").naturalWidth > 0);
		await page.waitForFunction(() => document.getElementById("dNameDiv0").getAnimations().every((animation) => animation.playState === "finished"));
		assert.equal(await page.locator("#ZombieHand").isVisible(), false, "legacy hand does not cover the menu");
		assert.equal(await page.locator("#pvz-scene-backdrop > div").isVisible(), false, "menu has one sharp background");
		if (process.env.PVZ_MENU_SCREENSHOT) await page.screenshot({ path: process.env.PVZ_MENU_SCREENSHOT + `-${browserType.name()}.png` });
		await page.emulateMedia({ reducedMotion: "reduce" });
		assert.ok((await page.locator(".pvz-menu-zombie img").getAttribute("src")).endsWith("SelectorZombie.svg"), "menu uses peeking zombie artwork");
		assert.equal(await leaf.isVisible(), false, "reduced motion hides falling leaves");
		assert.equal(await page.locator(".pvz-menu-zombie").evaluate((element) => element.getAnimations().length), 0, "reduced motion stops zombie movement");
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.evaluate(() => {
			window.abxz = null;
		});
		await page.locator("#dAdventure").tap();
		await page.waitForFunction(() => document.getElementById("DivTeachBar")?.textContent.includes("seed packet"));
		await page.waitForFunction(() => document.querySelector("#pvz-scene-backdrop > div")?.classList.contains("pvz-game-panorama"));
		assert.equal(await leaf.evaluate((element) => getComputedStyle(element).animationPlayState), "paused", "menu animation pauses during gameplay");
		await checkLayout(page, 844, 390);
		const ground = await page.locator("#tGround").boundingBox();
		const panorama = await page.locator(".pvz-game-panorama").boundingBox();
		assert.ok(Math.abs(ground.x - panorama.x) < 1, "panorama matches the board background origin");
		await plantAt(page, 3);
		await page.setViewportSize({ width: 926, height: 428 });
		await checkLayout(page, 926, 428);
		await plantAt(page, 7);
		// Safari changes visualViewport when its browser bars change height.
		await page.setViewportSize({ width: 844, height: 280 });
		await checkLayout(page, 844, 280);
		// Simulate unequal display cutout/home-indicator insets.
		await page.evaluate(() => {
			for (const [side, value] of Object.entries({ left: 59, right: 21, top: 3, bottom: 21 }))
				document.body.style.setProperty(`--pvz-inset-${side}`, `${value}px`);
			window.dispatchEvent(new Event("resize"));
		});
		const safe = await checkLayout(page, 844, 280);
		assert.ok(safe.stage.left >= 58 && safe.stage.right <= 824 && safe.stage.top >= 2 && safe.stage.bottom <= 260, "safe area protects board");
		await plantAt(page, 5);
		await page.evaluate(() => {
			for (const side of ["left", "right", "top", "bottom"]) document.body.style.removeProperty(`--pvz-inset-${side}`);
			window.dispatchEvent(new Event("resize"));
		});
		for (const [width, height] of [
			[1536, 709],
			[1366, 1024],
			[2560, 1080],
			[390, 844],
		]) {
			await page.setViewportSize({ width, height });
			await checkLayout(page, width, height);
		}
		assert.ok(await page.locator("#pvz-orientation-hint").isVisible(), "portrait rotate hint");
		await page.setViewportSize({ width: 844, height: 390 });
		await checkLayout(page, 844, 390);
		await page.locator("#dMenu1").tap();
		await page.waitForFunction(() => document.body.classList.contains("game-paused"));
		await page.evaluate(() => {
			ClickMenu();
			SelectModal(0);
		});
		await page.waitForSelector("#dLogo");
		await page.locator("#LogoWord > span").first().click();
		await page.waitForFunction(() => document.body.classList.contains("pvz-selector"));
		assert.deepEqual(errors, [], "no gameplay runtime errors");
		console.log(
			`${browserType.name()}: menu animation, reduced motion, viewport sizes, safe areas, rotation, exact-cell touch planting, pause and scene changes passed`
		);
	} finally {
		await browser.close();
	}
}

(async () => {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const origin = `http://127.0.0.1:${server.address().port}`;
	try {
		await mobileTest(chromium, origin);
		await mobileTest(webkit, origin);
		const browser = await chromium.launch();
		try {
			const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
			page.on("dialog", (dialog) => dialog.dismiss());
			await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
			await openMenu(page, origin);
			assert.equal(await page.evaluate(() => document.body.style.zoom), "", "desktop window keeps classic layout");
			await page.locator("#pvz-fullscreen-button").click();
			await page.waitForFunction(() => !!document.fullscreenElement);
			await checkLayout(page, 1440, 900);
			await page.evaluate(() => document.exitFullscreen());
			await page.waitForFunction(() => document.body.style.zoom === "");
			console.log("desktop: fullscreen entry, proportional fit and exit passed");
		} finally {
			await browser.close();
		}
	} finally {
		server.close();
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
