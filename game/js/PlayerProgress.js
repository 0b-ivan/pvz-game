(() => {
	"use strict";

	const STORAGE_KEY = "pvz.playerProgress";
	const SCHEMA_VERSION = 1;
	const MAX_ADVENTURE_LEVEL = 50;

	const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	const clone = (value) => JSON.parse(JSON.stringify(value));
	const nowIso = () => new Date().toISOString();

	const getStorage = () => {
		if (typeof StorageUtil !== "undefined" && StorageUtil && typeof StorageUtil.getItem === "function") {
			return StorageUtil;
		}
		if (typeof globalThis !== "undefined" && globalThis.StorageUtil && typeof globalThis.StorageUtil.getItem === "function") {
			return globalThis.StorageUtil;
		}
		if (typeof localStorage !== "undefined") {
			return localStorage;
		}
		throw new Error("PlayerProgress requires StorageUtil or localStorage.");
	};

	const readJson = (raw) => {
		if (!raw) {
			return null;
		}
		try {
			const parsed = JSON.parse(raw);
			return isObject(parsed) ? parsed : null;
		} catch {
			return null;
		}
	};

	const toAdventureLevel = (value) => {
		const level = Number.parseInt(value, 10);
		if (!Number.isFinite(level)) {
			return 1;
		}
		return Math.min(MAX_ADVENTURE_LEVEL, Math.max(1, level));
	};

	const createDefaultState = () => {
		const timestamp = nowIso();
		return {
			schemaVersion: SCHEMA_VERSION,
			revision: 0,
			createdAt: timestamp,
			updatedAt: timestamp,
			adventure: {
				currentLevel: 1,
				finished: false,
				completedLevels: {},
			},
			economy: {
				coins: 0,
			},
			store: {
				purchases: {},
				inventory: {
					fertilizer: 0,
					bugSpray: 0,
					chocolate: 0,
					treeFood: 0,
				},
			},
			unlocks: {
				shop: false,
				zenGarden: false,
				mushroomGarden: false,
				aquariumGarden: false,
				treeOfWisdom: false,
			},
			zenGarden: {
				nextPlantId: 1,
				plants: [],
				wheelbarrowPlantId: null,
				stinky: {
					owned: false,
					hasBeenSeen: false,
					lastChocolateAt: null,
					x: null,
					y: null,
				},
			},
		};
	};

	const normalizeCountMap = (value) => {
		if (!isObject(value)) {
			return {};
		}
		const normalized = {};
		for (const [key, count] of Object.entries(value)) {
			const parsed = Number.parseInt(count, 10);
			if (Number.isFinite(parsed) && parsed >= 0) {
				normalized[key] = parsed;
			}
		}
		return normalized;
	};

	const normalizeCompletedLevels = (value) => {
		if (!isObject(value)) {
			return {};
		}
		const normalized = {};
		for (const [key, record] of Object.entries(value)) {
			const level = Number.parseInt(key, 10);
			if (!Number.isFinite(level) || level < 1 || level > MAX_ADVENTURE_LEVEL || !isObject(record)) {
				continue;
			}
			normalized[String(level)] = clone(record);
		}
		return normalized;
	};

	const normalizeState = (candidate) => {
		const defaults = createDefaultState();
		if (!isObject(candidate)) {
			return defaults;
		}

		const adventure = isObject(candidate.adventure) ? candidate.adventure : {};
		const economy = isObject(candidate.economy) ? candidate.economy : {};
		const store = isObject(candidate.store) ? candidate.store : {};
		const inventory = isObject(store.inventory) ? store.inventory : {};
		const unlocks = isObject(candidate.unlocks) ? candidate.unlocks : {};
		const zenGarden = isObject(candidate.zenGarden) ? candidate.zenGarden : {};
		const stinky = isObject(zenGarden.stinky) ? zenGarden.stinky : {};

		const coins = Number.parseInt(economy.coins, 10);
		const nextPlantId = Number.parseInt(zenGarden.nextPlantId, 10);
		const revision = Number.parseInt(candidate.revision, 10);

		return {
			...defaults,
			...candidate,
			schemaVersion: SCHEMA_VERSION,
			revision: Number.isFinite(revision) && revision >= 0 ? revision : 0,
			createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : defaults.createdAt,
			updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : defaults.updatedAt,
			adventure: {
				...defaults.adventure,
				...adventure,
				currentLevel: toAdventureLevel(adventure.currentLevel),
				finished: Boolean(adventure.finished),
				completedLevels: normalizeCompletedLevels(adventure.completedLevels),
			},
			economy: {
				...defaults.economy,
				...economy,
				coins: Number.isFinite(coins) && coins >= 0 ? coins : 0,
			},
			store: {
				...defaults.store,
				...store,
				purchases: normalizeCountMap(store.purchases),
				inventory: {
					...defaults.store.inventory,
					...inventory,
					fertilizer: Math.max(0, Number.parseInt(inventory.fertilizer, 10) || 0),
					bugSpray: Math.max(0, Number.parseInt(inventory.bugSpray, 10) || 0),
					chocolate: Math.max(0, Number.parseInt(inventory.chocolate, 10) || 0),
					treeFood: Math.max(0, Number.parseInt(inventory.treeFood, 10) || 0),
				},
			},
			unlocks: {
				...defaults.unlocks,
				...unlocks,
				shop: Boolean(unlocks.shop),
				zenGarden: Boolean(unlocks.zenGarden),
				mushroomGarden: Boolean(unlocks.mushroomGarden),
				aquariumGarden: Boolean(unlocks.aquariumGarden),
				treeOfWisdom: Boolean(unlocks.treeOfWisdom),
			},
			zenGarden: {
				...defaults.zenGarden,
				...zenGarden,
				nextPlantId: Number.isFinite(nextPlantId) && nextPlantId >= 1 ? nextPlantId : 1,
				plants: Array.isArray(zenGarden.plants) ? clone(zenGarden.plants) : [],
				wheelbarrowPlantId: zenGarden.wheelbarrowPlantId ?? null,
				stinky: {
					...defaults.zenGarden.stinky,
					...stinky,
					owned: Boolean(stinky.owned),
					hasBeenSeen: Boolean(stinky.hasBeenSeen),
				},
			},
		};
	};

	const migrateLegacyAdventure = (state, storage) => {
		let changed = false;
		const legacyLevel = storage.getItem("level");
		if (legacyLevel !== null && legacyLevel !== undefined) {
			const migratedLevel = toAdventureLevel(legacyLevel);
			if (migratedLevel > state.adventure.currentLevel) {
				state.adventure.currentLevel = migratedLevel;
				changed = true;
			}
		}

		const legacyLevels = readJson(storage.getItem("levels"));
		if (legacyLevels) {
			for (const [key, record] of Object.entries(legacyLevels)) {
				const level = Number.parseInt(key, 10);
				if (!Number.isFinite(level) || level < 1 || level > MAX_ADVENTURE_LEVEL || !isObject(record)) {
					continue;
				}
				if (!state.adventure.completedLevels[String(level)]) {
					state.adventure.completedLevels[String(level)] = clone(record);
					changed = true;
				}
			}
		}

		if (state.adventure.completedLevels[String(MAX_ADVENTURE_LEVEL)] && !state.adventure.finished) {
			state.adventure.finished = true;
			changed = true;
		}

		return changed;
	};

	const writeState = (state) => {
		getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
		return clone(state);
	};

	const load = () => {
		const storage = getStorage();
		const raw = storage.getItem(STORAGE_KEY);
		const parsed = readJson(raw);
		const state = normalizeState(parsed);
		const migrated = migrateLegacyAdventure(state, storage);

		if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || migrated) {
			state.updatedAt = nowIso();
			writeState(state);
		}

		return clone(state);
	};

	const save = (candidate) => {
		const state = normalizeState(candidate);
		state.revision += 1;
		state.updatedAt = nowIso();
		return writeState(state);
	};

	const update = (mutator) => {
		if (typeof mutator !== "function") {
			throw new TypeError("PlayerProgress.update requires a function.");
		}
		const state = load();
		const replacement = mutator(state);
		return save(replacement === undefined ? state : replacement);
	};

	const setCurrentAdventureLevel = (level) =>
		update((state) => {
			state.adventure.currentLevel = toAdventureLevel(level);
		});

	const recordAdventureCompletion = (record) => {
		if (!isObject(record)) {
			return load();
		}
		const level = Number.parseInt(record.Lvl ?? record.level, 10);
		if (!Number.isFinite(level) || level < 1 || level > MAX_ADVENTURE_LEVEL) {
			return load();
		}

		return update((state) => {
			state.adventure.completedLevels[String(level)] = clone(record);
			state.adventure.currentLevel = Math.max(state.adventure.currentLevel, Math.min(MAX_ADVENTURE_LEVEL, level + 1));
			if (level === MAX_ADVENTURE_LEVEL) {
				state.adventure.finished = true;
			}
		});
	};

	const api = Object.freeze({
		STORAGE_KEY,
		SCHEMA_VERSION,
		MAX_ADVENTURE_LEVEL,
		createDefaultState,
		load,
		save,
		update,
		setCurrentAdventureLevel,
		recordAdventureCompletion,
	});

	globalThis.PVZPlayerProgress = api;
	if (typeof module !== "undefined" && module.exports) {
		module.exports = api;
	}
})();
