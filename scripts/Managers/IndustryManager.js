import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    static BUILDING_DEFS = {
        farmPlot: {
            name: "Farm Plot",
            workersPerBuilding: 2,
            effects: {
                crops: {base: {gain: 0.5}, worker: {drain: 0.5}},
                food: {worker: {gain: 0.6, drain: 0.2}},
            },
            buildCost: {crops: 10},
            sellReward: {crops: 5},
            capIncrease: {crops: 150},
        },
        treePlantation: {
            name: "Tree Plantation",
            workersPerBuilding: 3,
            effects: {
                trees: {base: {gain: 0.5}, worker: {drain: 0.5}},
                food: {worker: {drain: 0.2}},
                wood: {worker: {gain: 0.5}}
            },
            buildCost: {trees: 25},
        }
    };
    static ACTION_STEPS = [1, 5, 10, 25, 50, 100, 'max'];

    #loops = {};
    #cache = {dirty: true, rates: new Map(), snapshot: null};
    #recalculating = false;

    constructor(core) {
        this.core = core;
        this.access = {basic: true};
        this.resources = {
            workers: new Resource(10, {cap: 15, isDiscovered: true}),
            crops: new Resource(0, {cap: 500, isDiscovered: true}),
            food: new Resource(0, {cap: 1000, isDiscovered: true}),
            trees: new Resource(0),
            wood: new Resource(0),
            gold: new Resource(0),
        };
        this.workersOnStrike = false;
        this.configs = {resourceBoxExpanded: true, actionIncrement: 1};
        this.buildings = {};
        for (const type in IndustryManager.BUILDING_DEFS) {
            this.buildings[type] = {count: 0, workers: 0, dropped: false, unlocked: type === 'farmPlot'};
        }
    }

    #upgrades = new Set();
    #upgradeCounter = 0;

    // Optional priority: lower numbers apply later (default: 0)
    // Predicate function receives full context: (args) => boolean
    // args contains: {buildingType, resource, effectType, units, gain, drain, gainMult, drainMult, rates, buildingCount, rangeStart, rangeEnd, isBackwards, currentCount}
    upgrade(fn, predicate = null, priority = 0, id = null) {
        const entry = {
            id: id || `upgrade_${++this.#upgradeCounter}`,
            fn,
            predicate,
            priority,
            order: this.#upgradeCounter
        };
        this.#upgrades.add(entry);
        this.#cache.dirty = true;
        return () => {
            if (this.#upgrades.delete(entry)) {
                this.#cache.dirty = true;
            }
        };
    }

    #sortedUpgrades() {
        return Array.from(this.#upgrades).sort((a, b) => {
            const byPriority = b.priority - a.priority;
            if (byPriority !== 0) return byPriority;
            return a.order - b.order;
        });
    }

    #applies(entry, args) {
        if (!entry.predicate) return true;
        return entry.predicate(args);
    }

    recalculate() {
        if (this.#recalculating) return;
        this.#recalculating = true;
        try {
            const snapshot = this.#buildSimulationSnapshot({
                buildings: this.buildings,
                resourceValues: this.#getResourceValues(),
                workersOnStrike: this.workersOnStrike
            });
            this.#cache.rates = snapshot.rates;
            this.#cache.snapshot = snapshot;
            this.#cache.dirty = false;
        } finally {
            this.#recalculating = false;
        }
    }


    #getDrainTag(resource, effectType) {
        return effectType === 'worker' && resource === 'food' ? 'pay' : 'input';
    }
    
    #computeEffect(ctx) {
        const basePerUnit = Number(ctx.baseValue ?? 0);
        const units = Number(ctx.units ?? 1);
        const operations = [];

        for (const entry of this.#sortedUpgrades()) {
            if (!this.#applies(entry, ctx)) continue;
            const result = entry.fn.call(this, ctx);
            operations.push(...this.#normalizeUpgradeResult(result, entry));
        }

        const sortedOperations = this.#sortOperations(operations);
        let perUnit = basePerUnit;
        const steps = [];

        for (const op of sortedOperations) {
            const before = perUnit;
            if (op.kind === 'set') perUnit = op.value;
            if (op.kind === 'add') perUnit += op.value;
            if (op.kind === 'mult') perUnit *= op.value;
            const after = perUnit;

            steps.push({
                ...op,
                before,
                after,
                displayValue: this.#formatOperationDisplay(op)
            });
        }

        return {
            ...ctx,
            baseTotal: basePerUnit * units,
            perUnit,
            value: perUnit * units,
            trace: { steps }
        };
    }

    #normalizeUpgradeResult(result, entry) {
        if (!result) return [];
        if (Array.isArray(result)) {
            return result.flatMap((op) => this.#normalizeOperation(op, entry));
        }
        if (Array.isArray(result.operations)) {
            return result.operations.flatMap((op) => this.#normalizeOperation(op, entry));
        }

        const operations = [];
        if (result.set !== undefined) {
            operations.push({
                kind: 'set',
                value: Number(result.set),
                label: result.label || 'set',
                layer: result.layer ?? 0
            });
        }
        if (result.add !== undefined) {
            operations.push({
                kind: 'add',
                value: Number(result.add),
                label: result.label || 'add',
                layer: result.layer ?? 0
            });
        }
        if (result.mult !== undefined) {
            operations.push({
                kind: 'mult',
                value: Number(result.mult),
                label: result.label || 'mult',
                layer: result.layer ?? 0
            });
        }
        if (Array.isArray(result.modifiers)) {
            operations.push(...result.modifiers.flatMap((mod) => this.#normalizeModifierOperation(mod, result.layer ?? 0)));
        }

        return operations.flatMap((op) => this.#normalizeOperation(op, entry));
    }

    #normalizeModifierOperation(mod, layer = 0) {
        const parsed = this.#parseOperationValue(mod?.value);
        if (!parsed) return [];
        return [{
            ...parsed,
            label: mod?.label || parsed.kind,
            layer
        }];
    }

    #parseOperationValue(value) {
        if (typeof value === 'number') return { kind: 'add', value };
        if (typeof value !== 'string') return null;
        const raw = value.trim();
        if (!raw) return null;
        if (raw.startsWith('×') || raw.startsWith('x') || raw.startsWith('X')) {
            const parsed = Number(raw.slice(1));
            return Number.isFinite(parsed) ? { kind: 'mult', value: parsed } : null;
        }
        if (raw.startsWith('+') || raw.startsWith('-')) {
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? { kind: 'add', value: parsed } : null;
        }
        if (raw.startsWith('=')) {
            const parsed = Number(raw.slice(1));
            return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : null;
        }
        return null;
    }

    #normalizeOperation(op, entry) {
        if (!op || !op.kind) return [];
        const kind = op.kind === 'mul' ? 'mult' : op.kind;
        if (!['set', 'add', 'mult'].includes(kind)) return [];
        const value = Number(op.value);
        if (!Number.isFinite(value)) return [];
        return [{
            kind,
            value,
            label: op.label || entry.id,
            layer: Number(op.layer ?? 0),
            source: op.source || entry.id,
            priority: entry.priority,
            order: entry.order
        }];
    }

    #sortOperations(operations) {
        const kindOrder = { set: 0, add: 1, mult: 2 };
        return [...operations].sort((a, b) => {
            const byLayer = (a.layer ?? 0) - (b.layer ?? 0);
            if (byLayer !== 0) return byLayer;
            const byKind = (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
            if (byKind !== 0) return byKind;
            const byPriority = (b.priority ?? 0) - (a.priority ?? 0);
            if (byPriority !== 0) return byPriority;
            return (a.order ?? 0) - (b.order ?? 0);
        });
    }

    #formatOperationDisplay(op) {
        if (op.kind === 'set') return `=${this.#formatFactor(op.value)}`;
        if (op.kind === 'add') return `${op.value >= 0 ? '+' : ''}${this.#formatFactor(op.value)}`;
        return `×${this.#formatFactor(op.value)}`;
    }

    #formatFactor(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value);
        if (Math.abs(n) >= 1000) return n.toExponential(2);
        const fixed = n.toFixed(3);
        return fixed.replace(/\.?0+$/, '');
    }

    #pushRateEffects(effects, def, effectType, units, isRemoval, type, buildingCount) {
        for (const [resource, eff] of Object.entries(def.effects || {})) {
            const effDef = eff[effectType];
            if (!effDef) continue;
            if (effDef.gain) {
                effects.push(this.#computeEffect({
                    category: 'rate', resource,
                    direction: isRemoval ? 'drain' : 'gain',
                    tag: 'prod', baseValue: effDef.gain?.toNumber?.() ?? effDef.gain,
                    units, buildingType: type, effectType, buildingCount
                }));
            }
            if (effDef.drain) {
                effects.push(this.#computeEffect({
                    category: 'rate', resource,
                    direction: isRemoval ? 'gain' : 'drain',
                    tag: effectType === 'worker' ? this.#getDrainTag(resource, effectType) : 'input',
                    baseValue: effDef.drain?.toNumber?.() ?? effDef.drain,
                    units, buildingType: type, effectType, buildingCount
                }));
            }
        }
    }

    #buildActionEffects(action, type, units) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || units === 0) return [];
        
        const effects = [];
        const effectType = (action === 'build' || action === 'sell') ? 'base' : 'worker';
        const isRemoval = action === 'sell' || action === 'furlough';
        const buildingCount = this.buildings[type]?.count || 0;
        
        this.#pushRateEffects(effects, def, effectType, units, isRemoval, type, buildingCount);
        
        if (action === 'sell') {
            const currentWorkers = this.buildings[type]?.workers || 0;
            const newMax = (def.workersPerBuilding || 0) * Math.max(0, buildingCount - units);
            const displaced = Math.max(0, currentWorkers - newMax);
            if (displaced > 0) {
                this.#pushRateEffects(effects, def, 'worker', displaced, true, type, buildingCount);
            }
        }
        
        if (action === 'build' && def.buildCost) {
            for (const [resource, amt] of Object.entries(def.buildCost)) {
                effects.push(this.#computeEffect({
                    category: 'cost', resource, direction: 'drain',
                    tag: 'build', baseValue: amt, units,
                    buildingType: type, buildingCount
                }));
            }
        }
        
        if (action === 'sell' && def.sellReward) {
            for (const [resource, amt] of Object.entries(def.sellReward)) {
                effects.push(this.#computeEffect({
                    category: 'reward', resource, direction: 'gain',
                    tag: 'return', baseValue: amt, units,
                    buildingType: type, buildingCount
                }));
            }
        }
        
        if ((action === 'build' || action === 'sell') && def.capIncrease) {
            for (const [resource, amt] of Object.entries(def.capIncrease)) {
                effects.push(this.#computeEffect({
                    category: 'cap', resource,
                    direction: isRemoval ? 'drain' : 'gain',
                    tag: 'cap', baseValue: amt, units,
                    buildingType: type, buildingCount
                }));
            }
        }
        
        if ((action === 'build' || action === 'sell') && def.workersPerBuilding) {
            effects.push(this.#computeEffect({
                category: 'cap', resource: 'workers',
                direction: isRemoval ? 'drain' : 'gain',
                tag: 'cap', baseValue: def.workersPerBuilding, units,
                buildingType: type, buildingCount
            }));
        }
        
        return effects.filter(e => e.value !== 0);
    }
    
    #buildAggregateEffects(type, effectType, units, buildingsState = this.buildings) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.effects || units === 0) return [];
        const effects = [];
        const buildingCount = buildingsState[type]?.count || 0;
        this.#pushRateEffects(effects, def, effectType, units, false, type, buildingCount);
        return effects.filter(e => e.value !== 0);
    }

    #getResourceValues(resources = this.resources) {
        const values = {};
        for (const [res, resource] of Object.entries(resources)) {
            values[res] = resource?.value?.toNumber?.() ?? 0;
        }
        return values;
    }

    #cloneBuildingsState(source = this.buildings) {
        const clone = {};
        for (const [type, b] of Object.entries(source)) {
            clone[type] = {
                count: b?.count || 0,
                workers: b?.workers || 0
            };
        }
        return clone;
    }

    #getRateContributorId(effect) {
        return [
            effect.category || 'rate',
            effect.resource,
            effect.buildingType || 'unknown',
            effect.effectType || 'base',
            effect.tag || '',
            effect.direction || 'neutral'
        ].join(':');
    }

    #describeRateContributor(effect) {
        if (effect.tag === 'prod') return 'prod';
        if (effect.tag === 'pay') return 'pay';
        if (effect.tag === 'input') return 'input';
        return effect.tag || '';
    }

    #toRateContributor(effect) {
        const sign = effect.direction === 'gain' ? 1 : -1;
        return {
            ...effect,
            id: this.#getRateContributorId(effect),
            note: this.#describeRateContributor(effect),
            signedBaseValue: sign * effect.baseValue,
            signedPerUnit: sign * effect.perUnit,
            signedRawValue: sign * effect.value
        };
    }

    #buildRateContributors(buildingsState = this.buildings) {
        const contributors = [];

        for (const [type, b] of Object.entries(buildingsState)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects) continue;

            if (b.count > 0) {
                for (const effect of this.#buildAggregateEffects(type, 'base', b.count, buildingsState)) {
                    contributors.push(this.#toRateContributor(effect));
                }
            }

            if (b.workers > 0) {
                for (const effect of this.#buildAggregateEffects(type, 'worker', b.workers, buildingsState)) {
                    contributors.push(this.#toRateContributor(effect));
                }
            }
        }

        return contributors;
    }

    #computeWorkerThrottleState(contributors, resourceValues = this.#getResourceValues(), workersOnStrike = this.workersOnStrike) {
        const nonWorkerGains = new Map();
        const workerDrains = new Map();

        for (const contributor of contributors) {
            if (contributor.direction === 'gain' && contributor.effectType !== 'worker') {
                nonWorkerGains.set(
                    contributor.resource,
                    (nonWorkerGains.get(contributor.resource) || 0) + contributor.value
                );
            }

            if (contributor.effectType === 'worker' && contributor.direction === 'drain') {
                workerDrains.set(
                    contributor.resource,
                    (workerDrains.get(contributor.resource) || 0) + contributor.value
                );
            }
        }

        const bottlenecks = [];
        let scale = workersOnStrike ? 0 : 1;

        if (!workersOnStrike) {
            for (const [resource, workerDrain] of workerDrains.entries()) {
                if (workerDrain <= 0) continue;
                if ((resourceValues[resource] || 0) > 0) continue;

                const supply = nonWorkerGains.get(resource) || 0;
                const resourceScale = workerDrain > 0 ? supply / workerDrain : 1;
                if (resourceScale < 1) bottlenecks.push(resource);
                scale = Math.min(scale, resourceScale);
            }
        } else {
            for (const [resource, workerDrain] of workerDrains.entries()) {
                if (workerDrain > 0) bottlenecks.push(resource);
            }
        }

        return {
            scale: Math.max(0, Math.min(1, scale)),
            bottlenecks,
            workersOnStrike: Boolean(workersOnStrike)
        };
    }

    #buildSimulationSnapshot({
        buildings = this.buildings,
        resourceValues = this.#getResourceValues(),
        workersOnStrike = this.workersOnStrike
    } = {}) {
        const contributors = this.#buildRateContributors(buildings);
        const throttle = this.#computeWorkerThrottleState(contributors, resourceValues, workersOnStrike);
        const contributorEntries = [];
        const contributorsById = new Map();

        for (const contributor of contributors) {
            const workerScale = contributor.effectType === 'worker' ? throttle.scale : 1;
            const effectiveValue = contributor.signedRawValue * workerScale;
            const entry = {
                ...contributor,
                workerScale,
                effectiveValue,
                workersOnStrike: throttle.workersOnStrike
            };
            contributorEntries.push(entry);
            contributorsById.set(entry.id, entry);
        }

        const resources = {};
        const rates = new Map();
        const resourceKeys = new Set([
            ...Object.keys(this.resources),
            ...contributorEntries.map((entry) => entry.resource)
        ]);

        for (const resource of resourceKeys) {
            const resourceContributors = contributorEntries.filter((entry) => entry.resource === resource);
            const rawRate = resourceContributors.reduce((sum, entry) => sum + entry.effectiveValue, 0);
            const value = resourceValues[resource] || 0;
            const cap = this.#getCapForState(resource, buildings);

            let rate = rawRate;
            let clamp = null;

            if (rawRate > 0 && cap !== undefined && value >= cap) {
                rate = 0;
                clamp = { type: 'cap', label: 'capped', before: rawRate, after: 0 };
            } else if (rawRate < 0 && value <= 0) {
                rate = 0;
                clamp = { type: 'floor', label: 'empty', before: rawRate, after: 0 };
            }

            resources[resource] = {
                resource,
                value,
                cap,
                rawRate,
                rate,
                clamp,
                contributorIds: resourceContributors.map((entry) => entry.id)
            };
            rates.set(resource, rate);
        }

        return {
            rates,
            resources,
            contributors: contributorEntries,
            contributorsById,
            scale: throttle.scale,
            bottlenecks: throttle.bottlenecks,
            workersOnStrike: throttle.workersOnStrike
        };
    }

    #getCurrentSnapshot() {
        this.recalculate();
        return this.#cache.snapshot;
    }

    #applyActionToState(action, type, units, buildingsState, resourceValues) {
        const b = buildingsState[type];
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!b || !def || units <= 0) return;

        if (action === 'build') {
            if (def.buildCost) {
                for (const [res, cost] of Object.entries(def.buildCost)) {
                    resourceValues[res] = Math.max(0, (resourceValues[res] || 0) - (cost * units));
                }
            }
            b.count += units;
            this.#clampResourceValuesForState(resourceValues, buildingsState);
            return;
        }

        if (action === 'sell') {
            if (def.sellReward) {
                for (const [res, reward] of Object.entries(def.sellReward)) {
                    resourceValues[res] = (resourceValues[res] || 0) + (reward * units);
                }
            }
            b.count = Math.max(0, b.count - units);
            const maxWorkers = (def.workersPerBuilding || 0) * b.count;
            if (b.workers > maxWorkers) b.workers = maxWorkers;
            this.#clampResourceValuesForState(resourceValues, buildingsState);
            return;
        }

        if (action === 'hire') {
            b.workers += units;
            this.#clampResourceValuesForState(resourceValues, buildingsState);
            return;
        }

        if (action === 'furlough') {
            b.workers = Math.max(0, b.workers - units);
            this.#clampResourceValuesForState(resourceValues, buildingsState);
        }
    }

    #getCapForState(res, buildingsState) {
        const resource = this.resources[res];
        if (!resource?.cap) return undefined;
        let cap = resource.cap.toNumber();
        for (const [bType, b] of Object.entries(buildingsState)) {
            const increase = IndustryManager.BUILDING_DEFS[bType]?.capIncrease?.[res];
            if (!increase || b.count <= 0) continue;
            const effect = this.#computeEffect({
                category: 'cap', resource: res, direction: 'gain', tag: 'cap',
                baseValue: increase, units: b.count, buildingType: bType,
                effectType: 'base', buildingCount: b.count
            });
            cap += effect.value;
        }
        return cap;
    }

    #clampResourceValuesForState(resourceValues, buildingsState) {
        for (const resource of Object.keys(this.resources)) {
            const current = Math.max(0, resourceValues[resource] || 0);
            const cap = this.#getCapForState(resource, buildingsState);
            resourceValues[resource] = cap !== undefined ? Math.min(current, cap) : current;
        }
    }

    #applyResourceValues(resourceValues) {
        for (const [resource, value] of Object.entries(resourceValues)) {
            if (!this.resources[resource]) continue;
            this.resources[resource].value = new Decimal(value || 0);
        }
    }

    #resolveActionAmount(action, type, amount = null) {
        const limit = this.getActionLimit(action, type);
        const requested = amount ?? this.getActionPlan(action, type).actual;
        const numeric = Math.floor(Number(requested) || 0);
        return Math.max(0, Math.min(limit, numeric));
    }

    #didContributorChange(beforeEntry, afterEntry) {
        if (!beforeEntry || !afterEntry) return true;
        if (Math.abs((beforeEntry.effectiveValue || 0) - (afterEntry.effectiveValue || 0)) >= 0.0001) return true;
        if (Math.abs((beforeEntry.signedRawValue || 0) - (afterEntry.signedRawValue || 0)) >= 0.0001) return true;
        if (Math.abs((beforeEntry.signedPerUnit || 0) - (afterEntry.signedPerUnit || 0)) >= 0.0001) return true;
        if ((beforeEntry.units || 0) !== (afterEntry.units || 0)) return true;
        if (Math.abs((beforeEntry.workerScale || 1) - (afterEntry.workerScale || 1)) >= 0.0001) return true;
        if ((beforeEntry.trace?.steps?.length || 0) !== (afterEntry.trace?.steps?.length || 0)) return true;
        return false;
    }

    #didClampChange(beforeClamp, afterClamp) {
        if (!beforeClamp && !afterClamp) return false;
        if (!beforeClamp || !afterClamp) return true;
        return beforeClamp.type !== afterClamp.type
            || Math.abs((beforeClamp.before || 0) - (afterClamp.before || 0)) >= 0.0001
            || Math.abs((beforeClamp.after || 0) - (afterClamp.after || 0)) >= 0.0001;
    }

    #getContributorLifecycle(beforeEntry, afterEntry) {
        if (beforeEntry && afterEntry) return 'survives';
        if (afterEntry) return 'added';
        return 'removed';
    }

    #shouldIncludeRateContributor(beforeEntry, afterEntry) {
        if (!beforeEntry && !afterEntry) return false;
        if (!beforeEntry || !afterEntry) {
            const entry = afterEntry || beforeEntry;
            return Math.abs(entry.effectiveValue || 0) >= 0.0001
                || Math.abs(entry.signedRawValue || 0) >= 0.0001
                || Math.abs(entry.units || 0) >= 0.0001;
        }
        return this.#didContributorChange(beforeEntry, afterEntry);
    }

    #buildInstantActionChunks(effects) {
        const grouped = new Map();

        for (const effect of effects) {
            const key = `${effect.category}:${effect.resource}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    chunkType: 'instant',
                    category: effect.category,
                    resource: effect.resource,
                    label: effect.category === 'cap' ? `${effect.resource} cap` : effect.resource,
                    entries: [],
                    delta: 0
                });
            }

            const signedValue = effect.direction === 'gain' ? effect.value : -effect.value;
            const signedPerUnit = effect.direction === 'gain' ? effect.perUnit : -effect.perUnit;
            grouped.get(key).entries.push({
                ...effect,
                id: [
                    effect.category,
                    effect.resource,
                    effect.buildingType || 'unknown',
                    effect.tag || '',
                    effect.direction || 'neutral'
                ].join(':'),
                signedValue,
                signedPerUnit
            });
            grouped.get(key).delta += signedValue;
        }

        return [...grouped.values()];
    }

    #buildRateActionChunks(beforeSnapshot, afterSnapshot) {
        const chunks = [];
        const resources = new Set([
            ...Object.keys(beforeSnapshot.resources || {}),
            ...Object.keys(afterSnapshot.resources || {})
        ]);

        for (const resource of resources) {
            const beforeMeta = beforeSnapshot.resources?.[resource] || {
                rawRate: 0,
                rate: 0,
                clamp: null,
                contributorIds: []
            };
            const afterMeta = afterSnapshot.resources?.[resource] || {
                rawRate: 0,
                rate: 0,
                clamp: null,
                contributorIds: []
            };

            const contributorIds = new Set([
                ...(beforeMeta.contributorIds || []),
                ...(afterMeta.contributorIds || [])
            ]);

            const contributorPairs = [...contributorIds].map((id) => ({
                id,
                before: beforeSnapshot.contributorsById.get(id) || null,
                after: afterSnapshot.contributorsById.get(id) || null
            }));
            const hasChangedContributor = contributorPairs.some(({ before, after }) => this.#didContributorChange(before, after));
            const contributors = contributorPairs
                .filter(({ before, after }) => this.#shouldIncludeRateContributor(before, after))
                .map(({ id, before, after }) => ({
                    id,
                    before,
                    after,
                    lifecycle: this.#getContributorLifecycle(before, after)
                }));

            const delta = (afterMeta.rawRate || 0) - (beforeMeta.rawRate || 0);

            if (!hasChangedContributor && Math.abs(delta) < 0.0001) continue;

            chunks.push({
                key: `rate:${resource}`,
                chunkType: 'rate',
                resultMode: 'resulting-rate',
                resource,
                label: `${resource}/s`,
                delta,
                contributors,
                scaleBefore: beforeSnapshot.scale,
                scaleAfter: afterSnapshot.scale,
                workersOnStrikeBefore: beforeSnapshot.workersOnStrike,
                workersOnStrikeAfter: afterSnapshot.workersOnStrike
            });
        }

        return chunks;
    }

    previewAction(action, type, options = {}) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;

        const plan = this.getActionPlan(action, type);
        let units = options.forceUnits ?? plan.actual;
        if (!options.ignoreLimit) {
            units = Math.max(0, Math.min(this.getActionLimit(action, type), units));
        }
        if (units <= 0) return null;

        const instantEffects = this.#buildActionEffects(action, type, units)
            .filter((effect) => effect.category !== 'rate');
        const beforeBuildings = this.#cloneBuildingsState(this.buildings);
        const afterBuildings = this.#cloneBuildingsState(this.buildings);
        const beforeResources = this.#getResourceValues();
        const afterResources = { ...beforeResources };

        this.#applyActionToState(action, type, units, afterBuildings, afterResources);

        const beforeSnapshot = this.#buildSimulationSnapshot({
            buildings: beforeBuildings,
            resourceValues: beforeResources,
            workersOnStrike: this.workersOnStrike
        });
        const afterSnapshot = this.#buildSimulationSnapshot({
            buildings: afterBuildings,
            resourceValues: afterResources,
            workersOnStrike: this.workersOnStrike
        });

        const warnings = [];
        if (action === 'sell') {
            const warning = this.getDemolishWorkerWarning(type);
            if (warning) warnings.push({
                type: 'worker-cap',
                text: `Employees: ${warning.currentWorkers} -> ${warning.newWorkers} (new cap)`
            });
        }

        return {
            segment: 'action-preview',
            action,
            type,
            units,
            plan,
            def,
            beforeSnapshot,
            afterSnapshot,
            warnings,
            chunks: [
                ...this.#buildInstantActionChunks(instantEffects),
                ...this.#buildRateActionChunks(beforeSnapshot, afterSnapshot)
            ]
        };
    }

    getWorkerScale() {
        return this.#getCurrentSnapshot()?.scale ?? 1;
    }

    getBottlenecks() {
        return this.#getCurrentSnapshot()?.bottlenecks || [];
    }

    getCap(res) {
        const cap = this.#getCapForState(res, this.buildings);
        return cap !== undefined ? new Decimal(cap) : undefined;
    }

    #commitAction(action, type, amount = null) {
        if (!this.buildings[type] || !IndustryManager.BUILDING_DEFS[type]) return 0;

        const actual = this.#resolveActionAmount(action, type, amount);
        if (actual <= 0) return 0;

        const resourceValues = this.#getResourceValues();
        this.#applyActionToState(action, type, actual, this.buildings, resourceValues);
        this.#applyResourceValues(resourceValues);
        this.#cache.dirty = true;
        this.broadcast();
        return actual;
    }

    build(type, amount = null) {
        return this.#commitAction('build', type, amount);
    }

    sell(type, amount = null) {
        return this.#commitAction('sell', type, amount);
    }

    hire(type, amount = null) {
        return this.#commitAction('hire', type, amount);
    }

    furlough(type, amount = null) {
        return this.#commitAction('furlough', type, amount);
    }

    getActionPlan(action, type) {
        const limit = this.getActionLimit(action, type);
        const selected = this.configs.actionIncrement;
        const target = selected === 'max' ? Math.max(1, limit) : Math.max(1, selected);
        const actual = selected === 'max' ? limit : Math.min(limit, target);
        return {selected, target, actual, limit};
    }

    getActionLimit(action, type) {
        const b = this.buildings[type];
        const def = IndustryManager.BUILDING_DEFS[type];
        
        switch (action) {
            case 'build': {
                if (!def?.buildCost) return Infinity;
                let max = Infinity;
                for (const [res, cost] of Object.entries(def.buildCost)) {
                    const have = this.resources[res]?.value.toNumber() || 0;
                    max = Math.min(max, Math.floor(have / cost));
                }
                return max;
            }
            case 'sell':
                return b?.count || 0;
            case 'hire': {
                if (!b?.count) return 0;
                const maxWorkers = (def?.workersPerBuilding || 0) * b.count;
                const slots = maxWorkers - (b.workers || 0);
                return Math.min(this.unassignedWorkers, slots);
            }
            case 'furlough':
                return b?.workers || 0;
            default:
                return 0;
        }
    }

    cycleIncrement() {
        const steps = IndustryManager.ACTION_STEPS;
        const idx = steps.indexOf(this.configs.actionIncrement);
        this.configs.actionIncrement = steps[(idx + 1) % steps.length];
        this.broadcast();
    }

    get unassignedWorkers() {
        const assigned = Object.values(this.buildings).reduce((a, b) => a + (b.workers || 0), 0);
        return Math.max(0, Math.floor(this.resources.workers.value.toNumber() - assigned));
    }

    tick(dt) {
        this.recalculate();

        const foodRate = this.#cache.rates.get('food') || 0;
        const foodDrain = foodRate < 0 ? Math.abs(foodRate) : 0;
        const food = this.resources.food;
        const nextStrikeState = Boolean(food && food.value.lt(foodDrain) && food.netGrowthRate.toNumber() < 0);
        if (nextStrikeState !== this.workersOnStrike) {
            this.workersOnStrike = nextStrikeState;
            this.recalculate();
        }

        for (const resource of Object.values(this.resources)) {
            resource.update(dt);
        }
    }

    broadcast() {
        this.recalculate();
        for (const [res, resource] of Object.entries(this.resources)) {
            const rate = this.#cache.rates.get(res);
            resource.rate = new Decimal(rate || 0);
        }
        this.core.ui.panels.industry.render(this.getData());
    }

    updateLoops(activeMainPanel = this.core.ui.activePanels.main) {
        const industryActive = activeMainPanel === "industry";
        if (industryActive && !this.#loops.industry) {
            this.broadcast();
            this.#loops.industry = this.core.ui.createRenderInterval(() => this.broadcast());
        } else if (!industryActive) {
            this.core.ui.destroyRenderInterval(this.#loops.industry);
            this.#loops.industry = null;
        }
    }

    boot() {
        if (this.configs.resourceBoxExpanded) {
            this.core.ui.panels.industry.toggleView();
        }
        this.#setupGrowthFns();
        this.#setupAllUpgrades();
    }

    #setupAllUpgrades() {
        this.#setupSavvyUpgrade();
    }

    #setupSavvyUpgrade() {
        this.upgrade((ctx) => {
            if (ctx.tag !== 'prod') return null;
            const savvy = this.core.city?.ruler?.savvy || 0;
            if (savvy === 0) return null;
            const mult = 1 + savvy * 0.01;
            return {
                operations: [{
                    kind: 'mult',
                    value: mult,
                    label: 'savvy',
                    layer: 20
                }]
            };
        }, null, 20, 'ruler_savvy_prod');
    }

    #setupGrowthFns() {
        for (const [res, resource] of Object.entries(this.resources)) {
            resource.growthFns = {};
            resource.addGrowthFn('industry', () => {
                return new Decimal(this.#cache.rates.get(res) || 0);
            });
            if (resource.cap !== undefined) {
                resource.capFn = () => this.getCap(res);
            }
        }
    }

    getData() {
        return {
            ...this,
            resources: Object.fromEntries(
                Object.entries(this.resources).filter(([, r]) => r.isDiscovered)
            )
        };
    }

    serialize() {
        const {core, ...rest} = this;
        rest.resources = Object.fromEntries(
            Object.entries(this.resources).map(([k, r]) => [k, r.serialize()])
        );
        return rest;
    }

    deserialize(data, savedTimestamp) {
        const {resources, buildings, ...rest} = data;
        if (resources) {
            for (const [k, rd] of Object.entries(resources)) {
                this.resources[k] = Resource.deserialize(rd);
            }
        }
        if (buildings) {
            for (const [type, bData] of Object.entries(buildings)) {
                if (this.buildings[type]) Object.assign(this.buildings[type], bData);
            }
        }
        Object.assign(this, rest);
        this.#setupGrowthFns();
        this.#cache.dirty = true;
        
        if (savedTimestamp && this.core.settings.configs.offlineprogress === "on") {
            const offlineTime = Math.min((Date.now() - savedTimestamp) / 1000, 86400);
            if (offlineTime > 0) this.tick(offlineTime);
        }
        
        this.broadcast();
    }

    performTheurgy(type) {
        const changes = [];
        if (type === "plant") {
            this.resources.crops.add(1);
            changes.push({type: "gain", amt: 1, res: "crops"});
        } else if (type === "harvest" && this.resources.crops.value.gte(1)) {
            this.resources.crops.subtract(1);
            this.resources.food.add(1);
            changes.push({type: "drain", amt: 1, res: "crops"});
            changes.push({type: "gain", amt: 1, res: "food"});
        }
        this.broadcast();
        return changes;
    }

    canPerformTheurgy(type) {
        return type === "plant" || (type === "harvest" && this.resources.crops.value.gte(1));
    }

    isUnlocked(type) { return this.buildings[type]?.unlocked === true; }
    unlock(type) {
        const b = this.buildings[type];
        if (!b || b.unlocked) return false;
        b.unlocked = true;
        this.broadcast();
        return true;
    }

    getMaxWorkers(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        return (def?.workersPerBuilding || 0) * (this.buildings[type]?.count || 0);
    }

    getSelectedIncrement() {
        const v = this.configs?.actionIncrement;
        return v === 'max' ? 'max' : Math.max(1, Math.floor(Number(v) || 1));
    }

    getBuildProgress(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return 1;
        const target = this.getActionPlan('build', type).target || 1;
        let minProgress = 1;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const have = this.resources[res]?.value.toNumber() || 0;
            const need = cost * target;
            if (need > 0) minProgress = Math.min(minProgress, Math.max(0, have / need));
        }
        return minProgress;
    }

    getHireProgress(type) {
        const b = this.buildings[type];
        if (!b?.count) return 0;

        const maxWorkers = this.getMaxWorkers(type);
        const availableSlots = maxWorkers - (b.workers || 0);
        if (availableSlots <= 0) return 0;

        const plan = this.getActionPlan('hire', type);
        const target = plan.target || 1;
        const canHire = Math.min(this.unassignedWorkers, availableSlots);

        if (target <= 0) return 0;
        return Math.max(0, Math.min(1, canHire / target));
    }

    getResourceProgress(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return null;
        const target = this.getActionPlan('build', type).target || 1;
        
        let limiting = null;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const current = Math.floor(this.resources[res]?.value.toNumber() || 0);
            const required = Math.ceil(cost * target);
            const progress = required > 0 ? current / required : 1;
            if (!limiting || progress < limiting.progress) {
                limiting = {current: Math.min(current, required), required, progress};
            }
        }
        return limiting;
    }

    getTimeUntilNextBuilding(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return null;
        const target = this.getActionPlan('build', type).target || 1;
        
        let maxTime = 0;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const resource = this.resources[res];
            if (!resource) continue;
            const needed = cost * target - resource.value.toNumber();
            const rate = resource.netGrowthRate.toNumber();
            if (needed > 0 && rate > 0) maxTime = Math.max(maxTime, needed / rate);
        }
        return maxTime > 0 ? maxTime : null;
    }

    getDrainExceedsGainResources(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.effects || !this.buildings[type]?.workers) return [];
        
        return Object.entries(def.effects)
            .filter(([res, eff]) => eff?.worker?.drain && this.resources[res]?.netGrowthRate.toNumber() < 0)
            .map(([res]) => res);
    }

    getDemolishWorkerWarning(type) {
        const b = this.buildings[type];
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!b || !def?.workersPerBuilding) return null;
        
        const amount = this.getActionPlan('sell', type).actual;
        const newLimit = Math.max(0, (def.workersPerBuilding * b.count) - (amount * def.workersPerBuilding));
        
        if ((b.workers || 0) > newLimit) {
            return {currentWorkers: b.workers, newWorkers: newLimit, newLimit};
        }
        return null;
    }

    getBuildDisabledReason(type) {
        const plan = this.getActionPlan('build', type);
        if (plan.actual >= plan.target) return '';
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return '';
        
        const missing = Object.entries(def.buildCost)
            .map(([res, cost]) => {
                const have = this.resources[res]?.value.toNumber() || 0;
                const need = cost * plan.target;
                return have < need ? res : null;
            })
            .filter(Boolean);
        return missing.length ? `need more ${missing.join(', ')}` : 'cannot build';
    }

    getDemolishDisabledReason(type) {
        const plan = this.getActionPlan('sell', type);
        if (plan.actual >= plan.target) return '';
        const count = this.buildings[type]?.count || 0;
        return count === 0 ? 'no buildings' : `only ${count} building${count === 1 ? '' : 's'}`;
    }

    getHireDisabledReason(type) {
        const plan = this.getActionPlan('hire', type);
        if (plan.actual >= plan.target) return '';
        
        const b = this.buildings[type];
        if (!b?.count) return 'no buildings';
        
        const maxWorkers = this.getMaxWorkers(type);
        const slots = maxWorkers - (b.workers || 0);
        
        if (slots < plan.target && this.unassignedWorkers >= slots) {
            return slots === 0 ? 'worker limit reached' : `only ${slots} open slot${slots === 1 ? '' : 's'}`;
        }
        
        if (this.unassignedWorkers < plan.target) {
            return this.unassignedWorkers === 0 ? 'no available workers' : `only ${this.unassignedWorkers} available worker${this.unassignedWorkers === 1 ? '' : 's'}`;
        }
        
        return 'cannot hire';
    }

    getFurloughDisabledReason(type) {
        const plan = this.getActionPlan('furlough', type);
        if (plan.actual >= plan.target) return '';
        const workers = this.buildings[type]?.workers || 0;
        return workers === 0 ? 'no workers' : `only ${workers} worker${workers === 1 ? '' : 's'}`;
    }

    // ── Explanation spine ────────────────────────────────────────────────────

    explain(segment, options = {}) {
        switch (segment) {
            case 'action':    return this.#explainAction(options.action, options.type, options);
            case 'resource':  return this.#explainResource(options.resource);
            case 'aggregate': return this.#explainAggregate(options.type, options.effectType);
            case 'throttle':  return this.#explainThrottle(options.type, options);
            default:          return null;
        }
    }

    #fmt(val, opt = {}) { return this.core.ui.formatNumber(val, opt); }

    #toneOf(direction) {
        return direction === 'gain' ? 'gain' : direction === 'drain' ? 'drain' : 'neutral';
    }

    #toneOfValue(v) {
        return v > 0.0001 ? 'gain' : v < -0.0001 ? 'drain' : 'neutral';
    }

    #signed(v) { return `${v >= 0 ? '+' : ''}${this.#fmt(v)}`; }

    #transition(before, after, note, decimalPlaces = 2) {
        const left = `×${this.#fmt(before, { decimalPlaces })}`;
        const right = `×${this.#fmt(after, { decimalPlaces })}`;
        return {
            value: Math.abs(before - after) >= 0.0001 ? { from: left, to: right } : right,
            label: '', note, tone: 'neutral', children: []
        };
    }

    // ── Sort helpers ─────────────────────────────────────────────────────────

    #sortEffectRows(effects) {
        const catOrd = { cost: 0, reward: 1, rate: 2, cap: 3 };
        const tagOrd = { input: 0, pay: 1, prod: 2 };
        return [...effects].sort((a, b) => {
            const cd = (catOrd[a.category] ?? 99) - (catOrd[b.category] ?? 99);
            if (cd !== 0) return cd;
            if (a.category === 'rate' && b.category === 'rate')
                return (tagOrd[a.tag] ?? 99) - (tagOrd[b.tag] ?? 99);
            return 0;
        });
    }

    #sortContributorPairs(contributors) {
        const effOrd = { base: 0, worker: 1 };
        const noteOrd = { input: 0, pay: 1, prod: 2 };
        return [...contributors].sort((a, b) => {
            const l = a.after || a.before || {};
            const r = b.after || b.before || {};
            const ed = (effOrd[l.effectType] ?? 99) - (effOrd[r.effectType] ?? 99);
            if (ed !== 0) return ed;
            return (noteOrd[l.note] ?? 99) - (noteOrd[r.note] ?? 99);
        });
    }

    // ── Shared row builders ──────────────────────────────────────────────────

    #traceChildren(trace) {
        return (trace?.steps || []).map(step => ({
            value: step.displayValue || step.value,
            label: '', note: step.label || step.source || '',
            tone: 'neutral', children: []
        }));
    }

    #effectChildren(effect, units, scale, effectType) {
        const children = this.#traceChildren(effect.trace);
        if (units > 1) {
            children.push({
                value: `×${units}`, label: '',
                note: effectType === 'base' ? 'buildings' : 'workers',
                tone: 'neutral', children: []
            });
        }
        if (scale < 1) {
            children.push({
                value: `×${this.#fmt(scale, { decimalPlaces: 2 })}`, label: '',
                note: 'throttled', tone: 'neutral', children: []
            });
        }
        return children;
    }

    // ── Action explanation ───────────────────────────────────────────────────

    #explainAction(action, type, options = {}) {
        const preview = this.previewAction(action, type, options);
        if (!preview) return null;

        return preview.chunks.map(chunk =>
            chunk.chunkType === 'instant'
                ? this.#sectionFromInstantChunk(chunk)
                : this.#sectionFromRateChunk(chunk)
        );
    }

    #sectionFromInstantChunk(chunk) {
        const chain = chunk.entries.map(entry => ({
            value: this.#signed(entry.signedPerUnit),
            label: chunk.label,
            note: entry.category === 'cost' ? 'cost' : entry.category === 'cap' ? '' : entry.tag || '',
            tone: this.#toneOfValue(entry.signedPerUnit),
            children: this.#instantEntryChildren(entry)
        }));
        const hasHierarchy = chain.some(l => l.children?.length) || chain.length > 1;
        return {
            chain,
            resultRows: hasHierarchy ? [{
                value: this.#signed(chunk.delta),
                label: chunk.label,
                tone: this.#toneOfValue(chunk.delta)
            }] : []
        };
    }

    #instantEntryChildren(entry) {
        const children = this.#traceChildren(entry);
        if ((entry?.units || 1) > 1)
            children.push({ value: `×${entry.units}`, label: '', note: 'actions', tone: 'neutral', children: [] });
        return children;
    }

    #sectionFromRateChunk(chunk) {
        const chain = this.#sortContributorPairs(chunk.contributors).map(contributor => {
            const basis = contributor.after || contributor.before;
            
            const bUnits = contributor.before?.units || 0;
            const aUnits = contributor.after?.units || 0;
            const isReduction = aUnits < bUnits || !contributor.after;
            const signMultiplier = isReduction ? -1 : 1;
            const effectiveBaseValue = basis.signedBaseValue * signMultiplier;
            
            return {
                value: this.#signed(effectiveBaseValue),
                label: chunk.label,
                note: basis.note || '',
                tone: this.#toneOfValue(effectiveBaseValue),
                children: this.#rateContributorChildren(contributor, chunk)
            };
        });

        const hasHierarchy = chain.some(l => l.children?.length) || chain.length > 1;
        return {
            chain,
            resultRows: hasHierarchy ? [{
                value: this.#signed(chunk.delta),
                label: chunk.label,
                tone: this.#toneOfValue(chunk.delta)
            }] : []
        };
    }

    #rateContributorChildren(contributor, chunk) {
        const { before: bE, after: aE, lifecycle } = contributor;
        const basis = aE || bE;
        const children = [];
        const bSteps = bE?.trace?.steps || [];
        const aSteps = aE?.trace?.steps || [];

        for (let i = 0, n = Math.max(bSteps.length, aSteps.length); i < n; i++) {
            const bv = bSteps[i]?.displayValue || '';
            const av = aSteps[i]?.displayValue || '';
            if (!bv && !av) continue;
            children.push({
                value: bv && av && bv !== av ? { from: bv, to: av } : (av || bv),
                label: '',
                note: aSteps[i]?.label || bSteps[i]?.label || aSteps[i]?.source || bSteps[i]?.source || '',
                tone: 'neutral', children: []
            });
        }

        const bUnits = bE?.units || 0;
        const aUnits = aE?.units || 0;
        const unitLabel = basis?.effectType === 'worker' ? 'workers' : 'buildings';
        if (bUnits !== aUnits)
            children.push({
                value: `×${Math.abs(aUnits - bUnits)}`,
                label: '', note: unitLabel, tone: 'neutral', children: []
            });

        const participatesAfter = lifecycle !== 'removed' && aE && (aE.units || 0) > 0;
        if (basis?.effectType === 'worker' && participatesAfter) {
            const bScale = bE?.workerScale ?? aE?.workerScale ?? 1;
            const aScale = aE?.workerScale ?? 1;
            const strikeBefore = chunk?.workersOnStrikeBefore === true;
            const strikeAfter = chunk?.workersOnStrikeAfter === true;

            if (strikeAfter)
                children.push(this.#transition(strikeBefore ? 0 : bScale, 0, 'workers on strike'));
            else if (Math.abs(bScale - aScale) >= 0.0001 || aScale !== 1)
                children.push(this.#transition(bScale, aScale, 'worker throttle'));
        }

        return children;
    }

    // ── Resource explanation ─────────────────────────────────────────────────

    #explainResource(res) {
        if (!this.resources[res]) return null;

        const snapshot = this.#getCurrentSnapshot();
        const rState = snapshot?.resources?.[res];
        const contributors = (rState?.contributorIds || [])
            .map(id => snapshot.contributorsById.get(id))
            .filter(Boolean);

        if (!contributors.length) return null;

        const sorted = this.#sortEffectRows(contributors);
        const chain = [];

        for (const entry of sorted) {
            const def = IndustryManager.BUILDING_DEFS[entry.buildingType];
            const name = entry.effectType === 'base'
                ? (def?.name?.toLowerCase() || entry.buildingType)
                : 'workers';
            const rowValue = Math.abs(entry.signedBaseValue);
            const scale = entry.effectType === 'worker' ? (entry.workerScale ?? 1) : 1;
            const note = this.#resourceRateNote(name, entry.effectType, entry.tag);

            chain.push({
                value: `${entry.direction === 'gain' ? '+' : '-'}${this.#fmt(rowValue)}`,
                label: `${res}/s`,
                tone: this.#toneOf(entry.direction),
                note,
                children: this.#effectChildren(entry, entry.units, scale, entry.effectType)
            });
        }

        if (!chain.length) return null;

        const rawNet = rState?.rawRate || 0;
        const net = rState?.rate || 0;
        const clamp = rState?.clamp || null;
        const isCapped = clamp?.type === 'cap';
        const hasCapStage = isCapped && rawNet > 0 && clamp;

        if (hasCapStage) {
            chain.push({
                kind: 'result',
                value: this.#signed(rawNet),
                label: `${res}/s`,
                tone: this.#toneOfValue(rawNet)
            });
            chain.push({
                value: `×${clamp.after === 0 ? '0' : '1'}`,
                label: '', note: clamp.label,
                tone: 'neutral', children: []
            });
            chain.push({
                kind: 'result',
                value: this.#signed(net),
                label: `${res}/s`,
                tone: this.#toneOfValue(net)
            });
            return [{ key: `resource:${res}`, chain, resultRows: [] }];
        }

        return [{ key: `resource:${res}`, chain, resultRows: [{
            value: this.#signed(net),
            label: `${res}/s`,
            tone: this.#toneOfValue(net)
        }] }];
    }

    #resourceRateNote(sourceName, effectType, tag) {
        if (!tag) return sourceName;
        if (tag === 'prod') return effectType === 'worker' ? 'workers' : sourceName;
        if (tag === 'pay' || tag === 'input')
            return `${effectType === 'worker' ? 'worker' : sourceName} ${tag}`;
        return `${sourceName} ${tag}`;
    }

    // ── Aggregate explanation ────────────────────────────────────────────────

    #explainAggregate(type, effectType) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def?.effects) return null;

        const units = effectType === 'base' ? (b?.count || 0) : (b?.workers || 0);
        if (units === 0) return null;

        const scale = effectType === 'worker' ? this.getWorkerScale() : 1;
        const effects = this.#buildAggregateEffects(type, effectType, units);
        if (!effects.length) return null;

        const sorted = this.#sortEffectRows(effects);
        const groups = new Map();
        for (const eff of sorted) {
            if (!groups.has(eff.resource)) groups.set(eff.resource, []);
            groups.get(eff.resource).push(eff);
        }

        const chain = [];
        let firstGroup = true;

        for (const [resource, groupEffects] of groups) {
            if (!firstGroup) chain.push({ kind: 'separator' });
            firstGroup = false;

            let net = 0;
            let hasModifiers = false;

            for (const eff of groupEffects) {
                const children = this.#effectChildren(eff, units, scale, effectType);
                if (children.length) hasModifiers = true;
                net += (eff.direction === 'gain' ? eff.value : -eff.value) * scale;

                chain.push({
                    value: `${eff.direction === 'gain' ? '+' : '-'}${this.#fmt(eff.baseValue)}`,
                    label: `${resource}/s`,
                    tone: this.#toneOf(eff.direction),
                    note: eff.tag,
                    children
                });
            }

            if ((hasModifiers || groupEffects.length > 1) && Math.abs(net) >= 0.0001) {
                chain.push({
                    kind: 'result',
                    value: this.#signed(net),
                    label: `${resource}/s`,
                    tone: this.#toneOfValue(net)
                });
            }
        }

        if (!chain.length) return null;
        return [{ key: `aggregate:${type}:${effectType}`, chain, resultRows: [] }];
    }

    // ── Throttle explanation ─────────────────────────────────────────────────

    #explainThrottle(type, options = {}) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def?.effects) return null;

        const units = b?.workers || 0;
        if (units === 0) return null;

        const scale = this.getWorkerScale();
        const effects = this.#buildAggregateEffects(type, 'worker', units);
        if (!effects.length) return null;

        const sorted = this.#sortEffectRows(effects);
        const groups = new Map();
        for (const eff of sorted) {
            if (!groups.has(eff.resource)) groups.set(eff.resource, []);
            groups.get(eff.resource).push(eff);
        }

        const chain = [];
        let firstGroup = true;
        let renderedGroups = 0;

        for (const [resource, groupEffects] of groups) {
            let potential = 0;
            for (const eff of groupEffects) {
                potential += eff.direction === 'gain' ? eff.value : -eff.value;
            }
            const actual = potential * scale;

            if (potential <= 0 && actual <= 0) continue;

            if (!firstGroup) chain.push({ kind: 'separator' });
            firstGroup = false;
            renderedGroups += 1;

            chain.push({
                value: this.#signed(potential),
                label: `${resource}/s`,
                tone: this.#toneOfValue(potential),
                note: 'potential output'
            });
            chain.push({
                value: `×${this.#fmt(scale, { decimalPlaces: 2 })}`,
                note: 'throttled',
                tone: 'neutral'
            });
            chain.push({
                kind: 'result',
                value: this.#signed(actual),
                label: `${resource}/s`,
                tone: this.#toneOfValue(actual)
            });
        }

        if (!renderedGroups) {
            chain.push({
                value: `×${this.#fmt(scale, { decimalPlaces: 2 })}`,
                note: 'worker output scale',
                tone: 'neutral'
            });
        }

        const bottlenecks = this.getBottlenecks();
        const bottleneckText = bottlenecks.join(', ') || 'input';
        const payload = { key: `throttle:${type}`, chain, resultRows: [] };
        if (!options.omitHeader) {
            payload.header = `⚠ Worker output throttled by ${bottleneckText} supply`;
            payload.headerClass = 'bd-header-warn';
        }
        return [payload];
    }

    // ── Aliases ──────────────────────────────────────────────────────────────

    isMultiIncrement() { const i = this.getSelectedIncrement(); return i === 'max' || i > 1; }
    getNetRate(res) { return new Decimal(this.#cache.rates.get(res) || 0); }
    getRawRate(res) { return new Decimal(this.#cache.snapshot?.resources?.[res]?.rawRate || 0); }
    isBuildingUnlocked(type) { return this.isUnlocked(type); }
    unlockBuilding(type) { return this.unlock(type); }
    buildBuilding(type) { return this.build(type); }
    sellBuilding(type) { return this.sell(type); }
    assignWorkerToBuilding(type) { return this.hire(type); }
    unassignWorkerFromBuilding(type) { return this.furlough(type); }
    cycleActionIncrement() { return this.cycleIncrement(); }
    getWorkerScalingFactor() { return this.getWorkerScale(); }
    getBottleneckResources() { return this.getBottlenecks(); }
}

class Resource {
    constructor(initialValue = 0, options = {}) {
        this.value = new Decimal(initialValue);
        this.cap = options.cap !== undefined ? new Decimal(options.cap) : undefined;
        this.growthFns = {};
        this.capFn = null;
        this.isDiscovered = options.isDiscovered || false;
    }

    addGrowthFn(key, fn) { this.growthFns[key] = fn; }
    removeGrowthFn(key) { delete this.growthFns[key]; }

    get netGrowthRate() {
        let rate = new Decimal(0);
        for (const fn of Object.values(this.growthFns)) rate = rate.plus(fn());
        return rate;
    }

    get effectiveCap() { return this.capFn ? this.capFn() : this.cap; }

    update(dt) {
        this.value = this.value.plus(this.netGrowthRate.times(dt));
        const cap = this.effectiveCap;
        if (cap !== undefined && this.value.gt(cap)) this.value = cap;
        if (this.value.lt(0)) this.value = new Decimal(0);
    }

    add(v) {
        this.value = this.value.plus(v);
        const cap = this.effectiveCap;
        if (cap !== undefined && this.value.gt(cap)) this.value = cap;
    }

    subtract(v) {
        this.value = this.value.minus(v);
        if (this.value.lt(0)) this.value = new Decimal(0);
    }

    setValue(v) { this.value = new Decimal(v); }

    serialize() {
        return {
            value: this.value.toString(),
            cap: this.cap !== undefined ? this.cap.toString() : undefined,
            isDiscovered: this.isDiscovered
        };
    }

    static deserialize(data) {
        const options = {};
        if (data.cap !== undefined) options.cap = data.cap;
        if (data.isDiscovered !== undefined) options.isDiscovered = data.isDiscovered;
        return new Resource(data.value, options);
    }
}


