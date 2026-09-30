const { readFileSync, writeFileSync } = require("node:fs");
const buildId = process.env.CF_PAGES_COMMIT_SHA || "development";
if (!/^[a-zA-Z0-9_-]+$/.test(buildId)) throw new Error("Invalid build id");
const htmlPath = "game/index.html";
writeFileSync(
	htmlPath,
	readFileSync(htmlPath, "utf8")
		.replace(/window\.PVZ_BUILD_ID = "[^"]*";/, `window.PVZ_BUILD_ID = "${buildId}";`)
		.replace(/\?v=[a-zA-Z0-9_-]+(?=")/g, `?v=${buildId}`)
);
const workerPath = "service-worker.js";
writeFileSync(workerPath, readFileSync(workerPath, "utf8").replace(/^const CACHE_VERSION = .*;/m, `const CACHE_VERSION = "pvz-foundation-${buildId}";`));
