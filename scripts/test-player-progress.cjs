"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.resolve(__dirname, "../game/js/PlayerProgress.js");

function createStorage(seed = {}) {
	const data = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
	return {
		getItem(key) {
			return data.has(key) ? data.get(key) : null;
		},
		setItem(key, value) {
			data.set(key, String(value));
		},
		removeItem(key) {
			data.delete(key);
		},
		clear() {
			data.clear();
		},
		dump() {
			return Object.fromEntries(data.entries());
		},
	};
}

function loadProgress(seed = {}) {
	delete require.cache[modulePath];
	globalThis.StorageUtil = createStorage(seed);
	delete globalThis.PVZPlayerProgress;
	const api = require(modulePath);
	return { api, storage: globalThis.StorageUtil };
}

function cleanup() {
	delete require.cache[modulePath];
	delete globalThis.StorageUtil;
	delete globalThis.PVZPlayerProgress;
}

{
	const { api, storage } = loadProgress();
	const state = api.load();

	assert.equal(state.schemaVersion, 1);
	assert.equal(state.adventure.currentLevel, 1);
	assert.equal(state.economy.coins, 0);
	assert.deepEqual(state.zenGarden.plants, []);
	assert.ok(storage.getItem(api.STORAGE_KEY));
}

{
	const legacyLevels = {
		"4": { Lvl: 4, SunNum: 125, UserName: "legacy", T: 1234 },
		"7": { Lvl: 7, SunNum: 50, UserName: "legacy", T: 2345 },
	};
	const { api, storage } = loadProgress({
		level: "8",
		levels: JSON.stringify(legacyLevels),
	});
	const state = api.load();

	assert.equal(state.adventure.currentLevel, 8);
	assert.deepEqual(state.adventure.completedLevels["4"], legacyLevels["4"]);
	assert.deepEqual(state.adventure.completedLevels["7"], legacyLevels["7"]);
	assert.equal(storage.getItem("level"), "8", "legacy level key must remain untouched");
	assert.equal(storage.getItem("levels"), JSON.stringify(legacyLevels), "legacy levels key must remain untouched");
}

{
	const { api } = loadProgress({
		"pvz.playerProgress": "{broken-json",
		level: "12",
	});
	const state = api.load();

	assert.equal(state.adventure.currentLevel, 12);
	assert.equal(state.schemaVersion, api.SCHEMA_VERSION);
}

{
	const { api } = loadProgress();
	const updated = api.recordAdventureCompletion({
		Lvl: 12,
		SunNum: 225,
		UserName: "tester",
		T: 987,
	});

	assert.equal(updated.adventure.currentLevel, 13);
	assert.equal(updated.adventure.completedLevels["12"].SunNum, 225);
	assert.equal(updated.revision, 1);
}

{
	const { api } = loadProgress({
		levels: JSON.stringify({
			"50": { Lvl: 50, SunNum: 0, UserName: "legacy", T: 1000 },
		}),
	});
	const state = api.load();

	assert.equal(state.adventure.finished, true);
	assert.equal(state.adventure.currentLevel, 50);
}

{
	const futureState = {
		schemaVersion: 2,
		revision: 99,
		adventure: { currentLevel: 22 },
		futureOnly: { keepMe: true },
	};
	const rawFutureState = JSON.stringify(futureState);
	const { api, storage } = loadProgress({
		"pvz.playerProgress": rawFutureState,
	});
	const loaded = api.load();
	const afterUpdate = api.setCurrentAdventureLevel(23);

	assert.equal(loaded.schemaVersion, 2);
	assert.equal(afterUpdate.schemaVersion, 2);
	assert.equal(storage.getItem(api.STORAGE_KEY), rawFutureState, "newer schemas must never be downgraded or overwritten");
}

{
	const { api } = loadProgress();
	const completed = api.recordAdventureCompletion({ Lvl: 50, SunNum: 0, UserName: "tester", T: 1000 });

	assert.equal(completed.adventure.finished, true);
	assert.equal(completed.adventure.currentLevel, 50);
}

cleanup();
console.log("PlayerProgress tests passed.");
