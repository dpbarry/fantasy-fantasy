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
    #cache = {dirty: true, rates: new Map()};
    #recalculating = false;

    constructor(core) {
        this.core = core;
        this.access = {basic: false};
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

    // ═══════════════════════════════════════════════════════════════════════════
    // UPGRADE SYSTEM 
    // ═══════════════════════════════════════════════════════════════════════════

    #upgrades = new Set();

    // Optional priority: lower numbers apply later (default: 0)
    // Predicate function receives full context: (args) => boolean
    // args contains: {buildingType, resource, effectType, units, gain, drain, gainMult, drainMult, rates, buildingCount, rangeStart, rangeEnd, isBackwards, currentCount}
    upgrade(fn, predicate = null, priority = 0) {
        const entry = {fn, predicate, priority};
        this.#upgrades.add(entry);
        this.#cache.dirty = true;
        return () => {
            if (this.#upgrades.delete(entry)) {
                this.#cache.dirty = true;
            }
        };
    }

    #sortedUpgrades() {
        return Array.from(this.#upgrades).sort((a, b) => b.priority - a.priority);
    }

    #applies(entry, args) {
        if (!entry.predicate) return true;
        return entry.predicate(args);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RATE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════

    recalculate() {
        if (!this.#cache.dirty || this.#recalculating) return;
        
        this.#recalculating = true;
            const rawRates = new Map();
            
            for (const [type, b] of Object.entries(this.buildings)) {
                const def = IndustryManager.BUILDING_DEFS[type];
                if (!def?.effects || b.count === 0) continue;
                
                const buildingCount = b.count;
                for (const [res, eff] of Object.entries(def.effects)) {
                    if (eff.base) {
                        const ctx = { category: 'rate', resource: res, buildingType: type, effectType: 'base', units: b.count, buildingCount };
                        const gain = eff.base.gain ? this.#computeEffect({ ...ctx, direction: 'gain', tag: 'prod', baseValue: eff.base.gain }).value : 0;
                        const drain = eff.base.drain ? this.#computeEffect({ ...ctx, direction: 'drain', tag: 'input', baseValue: eff.base.drain }).value : 0;
                        rawRates.set(res, (rawRates.get(res) || 0) + gain - drain);
                    }
                    if (eff.worker && b.workers > 0) {
                        const ctx = { category: 'rate', resource: res, buildingType: type, effectType: 'worker', units: b.workers, buildingCount };
                        const gain = eff.worker.gain ? this.#computeEffect({ ...ctx, direction: 'gain', tag: 'prod', baseValue: eff.worker.gain }).value : 0;
                        const drain = eff.worker.drain ? this.#computeEffect({ ...ctx, direction: 'drain', tag: this.#getDrainTag(res, 'worker'), baseValue: eff.worker.drain }).value : 0;
                        rawRates.set(res, (rawRates.get(res) || 0) + gain - drain);
                    }
                }
            }

            const scale = this.getWorkerScale();
            const throttled = new Map();
            for (const [res, rate] of rawRates.entries()) {
                if (this.workersOnStrike) {
                    throttled.set(res, rate > 0 ? rate : 0);
                } else {
                    throttled.set(res, rate < 0 ? rate * scale : rate);
                }
            }
            
            this.#cache.rates = throttled;
            this.#cache.dirty = false;
            this.#recalculating = false;
        }
    
 

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED EFFECT SYSTEM - Every line item is an Effect with semantic tags
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Determine semantic tag for a drain effect
    // Worker food drains are 'pay' (wages), other drains are 'input' (materials)
    #getDrainTag(resource, effectType) {
        return effectType === 'worker' && resource === 'food' ? 'pay' : 'input';
    }
    
    // Compute a single effect with modifiers applied
    // ctx shape: { category, resource, direction, tag, baseValue, units, buildingType, effectType? }
    // - category: 'rate' | 'cost' | 'reward' | 'cap'
    // - direction: 'gain' | 'drain'
    // - tag: semantic identifier like 'prod', 'input', 'pay', 'build', 'cap'
    #computeEffect(ctx) {
        let value = ctx.baseValue;
        let mult = 1;
        const modifiers = [];
        
        // Apply upgrades that match this effect
        for (const entry of this.#sortedUpgrades()) {
            if (!this.#applies(entry, ctx)) continue;
            
            let mod = entry.fn.call(this, ctx);
            if (!mod) continue;
            
            // Apply meta upgrades
            for (const metaEntry of this.#sortedUpgrades()) {
                if (metaEntry === entry) continue;
                const metaCtx = { ...ctx, upgradeFn: entry.fn, upgradeResult: mod };
                const metaResult = metaEntry.fn.call(this, metaCtx);
                if (metaResult) mod = metaResult;
            }
            
            // Apply modifications
            if (mod.set !== undefined) value = mod.set;
            if (mod.add !== undefined) value += mod.add;
            if (mod.mult !== undefined) mult *= mod.mult;
            if (mod.modifiers) modifiers.push(...mod.modifiers);
        }
        
        return {
            ...ctx,
            value: value * mult * (ctx.units ?? 1),
            modifiers: modifiers.length > 0 ? modifiers : undefined
        };
    }
    
    // Build all effects for an action (returns array of Effect objects)
    #buildActionEffects(action, type, units) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || units === 0) return [];
        
        const effects = [];
        const effectType = (action === 'build' || action === 'sell') ? 'base' : 'worker';
        const isRemoval = action === 'sell' || action === 'furlough';
        const buildingCount = this.buildings[type]?.count || 0;
        
        // Rate effects (per-second gains/drains)
        for (const [resource, eff] of Object.entries(def.effects || {})) {
            const effDef = eff[effectType];
            if (!effDef) continue;
            
            // Production (gain)
            if (effDef.gain) {
                const baseValue = effDef.gain?.toNumber?.() ?? effDef.gain;
                effects.push(this.#computeEffect({
                    category: 'rate',
                    resource,
                    direction: isRemoval ? 'drain' : 'gain',
                    tag: 'prod',
                    baseValue,
                    units,
                    buildingType: type,
                    effectType,
                    buildingCount
                }));
            }
            
            // Drains - determine if pay or input based on context
            if (effDef.drain) {
                const baseValue = effDef.drain?.toNumber?.() ?? effDef.drain;
                const tag = effectType === 'worker' ? this.#getDrainTag(resource, effectType) : 'input';
                effects.push(this.#computeEffect({
                    category: 'rate',
                    resource,
                    direction: isRemoval ? 'gain' : 'drain',
                    tag,
                    baseValue,
                    units,
                    buildingType: type,
                    effectType,
                    buildingCount
                }));
            }
        }
        
        // One-time costs (for build action)
        if (action === 'build' && def.buildCost) {
            for (const [resource, amt] of Object.entries(def.buildCost)) {
                effects.push(this.#computeEffect({
                    category: 'cost',
                    resource,
                    direction: 'drain',
                    tag: 'build',
                    baseValue: amt,
                    units,
                    buildingType: type,
                    buildingCount
                }));
            }
        }
        
        // One-time rewards (for sell action)
        if (action === 'sell' && def.sellReward) {
            for (const [resource, amt] of Object.entries(def.sellReward)) {
                effects.push(this.#computeEffect({
                    category: 'reward',
                    resource,
                    direction: 'gain',
                    tag: 'sell',
                    baseValue: amt,
                    units,
                    buildingType: type,
                    buildingCount
                }));
            }
        }
        
        // Cap changes (for build/sell)
        if ((action === 'build' || action === 'sell') && def.capIncrease) {
            for (const [resource, amt] of Object.entries(def.capIncrease)) {
                effects.push(this.#computeEffect({
                    category: 'cap',
                    resource,
                    direction: isRemoval ? 'drain' : 'gain',
                    tag: 'cap',
                    baseValue: amt,
                    units,
                    buildingType: type,
                    buildingCount
                }));
            }
        }
        
        // Worker cap (from workersPerBuilding)
        if ((action === 'build' || action === 'sell') && def.workersPerBuilding) {
            effects.push(this.#computeEffect({
                category: 'cap',
                resource: 'workers',
                direction: isRemoval ? 'drain' : 'gain',
                tag: 'cap',
                baseValue: def.workersPerBuilding,
                units,
                buildingType: type,
                buildingCount
            }));
        }
        
        return effects.filter(e => e.value !== 0);
    }
    
    // Build aggregate effects for current buildings/workers
    #buildAggregateEffects(type, effectType, units) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.effects || units === 0) return [];
        
        const effects = [];
        const buildingCount = this.buildings[type]?.count || 0;
        
        for (const [resource, eff] of Object.entries(def.effects)) {
            const effDef = eff[effectType];
            if (!effDef) continue;
            
            if (effDef.gain) {
                const baseValue = effDef.gain?.toNumber?.() ?? effDef.gain;
                effects.push(this.#computeEffect({
                    category: 'rate',
                    resource,
                    direction: 'gain',
                    tag: 'prod',
                    baseValue,
                    units,
                    buildingType: type,
                    effectType,
                    buildingCount
                }));
            }
            
            if (effDef.drain) {
                const baseValue = effDef.drain?.toNumber?.() ?? effDef.drain;
                const tag = effectType === 'worker' ? this.#getDrainTag(resource, effectType) : 'input';
                effects.push(this.#computeEffect({
                    category: 'rate',
                    resource,
                    direction: 'drain',
                    tag,
                    baseValue,
                    units,
                    buildingType: type,
                    effectType,
                    buildingCount
                }));
            }
        }
        
        return effects.filter(e => e.value !== 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED EFFECT QUERIES (public API for all effect data)
    // ═══════════════════════════════════════════════════════════════════════════

    // Get all effects for an action (build/sell/hire/furlough)
    // Returns array of Effect objects, each with category, tag, and modifiers
    getActionEffects(action, type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;

        const plan = this.getActionPlan(action, type);
        if (plan.actual <= 0) return null;
        
        const effectType = (action === 'build' || action === 'sell') ? 'base' : 'worker';
        const scale = effectType === 'worker' ? this.getWorkerScale() : 1;
        const effects = this.#buildActionEffects(action, type, plan.actual);

        return { plan, effects, scale, def, units: plan.actual, effectType };
    }

    // Get aggregate effects of current buildings or workers
    getAggregateEffects(type, effectType) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def?.effects) return null;

        const units = effectType === 'base' ? (b?.count || 0) : (b?.workers || 0);
        if (units === 0) return null;

        const scale = effectType === 'worker' ? this.getWorkerScale() : 1;
        const effects = this.#buildAggregateEffects(type, effectType, units);

        return effects.length ? { effects, units, scale, def } : null;
    }

    // Get all effects acting on a resource from all buildings
    // Uses unified effect system by aggregating building/worker effects
    getResourceEffects(res) {
        if (!this.resources[res]) return null;

        const scale = this.getWorkerScale();
        const effects = [];
        let totalGain = 0, totalDrain = 0;

        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects?.[res]) continue;

            // Aggregate base effects
            if (b.count > 0) {
                const baseEffects = this.#buildAggregateEffects(type, 'base', b.count);
                for (const e of baseEffects) {
                    if (e.resource === res && e.value !== 0) {
                        effects.push(e);
                        if (e.direction === 'gain') totalGain += e.value;
                        else totalDrain += e.value;
                    }
                }
            }

            // Aggregate worker effects (with scale)
            if (b.workers > 0) {
                const workerEffects = this.#buildAggregateEffects(type, 'worker', b.workers);
                for (const e of workerEffects) {
                    if (e.resource === res && e.value !== 0) {
                        effects.push({ ...e, scale });
                        if (e.direction === 'gain') totalGain += e.value * scale;
                        else totalDrain += e.value * scale;
                    }
                }
            }
        }

        return effects.length
            ? { effects, totalGain, totalDrain, net: totalGain - totalDrain }
            : null;
    }



    // ═══════════════════════════════════════════════════════════════════════════
    // WORKER SCALING 
    // ═══════════════════════════════════════════════════════════════════════════

    getWorkerScale() {
        if (this.workersOnStrike) return 0;
        
        // Find all resources that workers drain
        const workerDrains = new Map();
        for (const [type, b] of Object.entries(this.buildings)) {
            if (b.workers <= 0) continue;
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects) continue;
            for (const [res, eff] of Object.entries(def.effects)) {
                if (eff.worker?.drain) {
                    workerDrains.set(res, (workerDrains.get(res) || 0) + eff.worker.drain * b.workers);
                }
            }
        }
        
        if (workerDrains.size === 0) return 1;
        
        // Check each drained resource
        let minScale = 1;
        for (const [res, workerDrain] of workerDrains) {
            const val = this.resources[res]?.value.toNumber() || 0;
            if (val > 0) continue; // Resource not depleted
            
            // Calculate non-worker production of this resource
            let production = 0;
            for (const [type, b] of Object.entries(this.buildings)) {
                const def = IndustryManager.BUILDING_DEFS[type];
                const eff = def?.effects?.[res];
                if (eff?.base?.gain && b.count > 0) {
                    const e = this.#computeEffect({
                        category: 'rate', resource: res, direction: 'gain', tag: 'prod',
                        baseValue: eff.base.gain, units: b.count, buildingType: type, effectType: 'base', buildingCount: b.count
                    });
                    production += e.value;
                }
            }
            
            // Scale = production / drain
            if (workerDrain > 0) {
                const scale = production / workerDrain;
                if (scale < minScale) minScale = scale;
            }
        }
        
        return Math.max(0, Math.min(1, minScale));
    }

    getBottlenecks() {
        const scale = this.getWorkerScale();
        if (scale >= 1) return [];
        
        const bottlenecks = [];
        for (const [type, b] of Object.entries(this.buildings)) {
            if (b.workers <= 0) continue;
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects) continue;
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.worker?.drain) continue;
                const val = this.resources[res]?.value.toNumber() || 0;
                if (val <= 0 && !bottlenecks.includes(res)) {
                    bottlenecks.push(res);
                }
            }
        }
        return bottlenecks;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESOURCE CAPS
    // ═══════════════════════════════════════════════════════════════════════════

    getCap(res) {
        const resource = this.resources[res];
        if (!resource?.cap) return undefined;
        
        let cap = resource.cap.toNumber();
        for (const [type, b] of Object.entries(this.buildings)) {
            const increase = IndustryManager.BUILDING_DEFS[type]?.capIncrease?.[res];
            if (increase) cap += increase * b.count;
        }
        return new Decimal(cap);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    build(type, amount = null) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def || !b) return 0;

        amount = amount ?? this.getActionPlan('build', type).actual;
        if (amount <= 0) return 0;

        if (def.buildCost) {
            for (const [res, cost] of Object.entries(def.buildCost)) {
                const total = cost * amount;
                if (!this.resources[res] || this.resources[res].value.lt(total)) return 0;
            }
            for (const [res, cost] of Object.entries(def.buildCost)) {
                this.resources[res].subtract(cost * amount);
            }
        }

        b.count += amount;
        this.#cache.dirty = true;
        this.broadcast();
        return amount;
    }

    sell(type, amount = null) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!b || b.count <= 0) return 0;

        amount = amount ?? this.getActionPlan('sell', type).actual;
        if (amount <= 0) return 0;

        if (def?.sellReward) {
            for (const [res, reward] of Object.entries(def.sellReward)) {
                if (this.resources[res]) this.resources[res].add(reward * amount);
            }
        }

        b.count = Math.max(0, b.count - amount);
        const maxWorkers = (def?.workersPerBuilding || 0) * b.count;
        if (b.workers > maxWorkers) b.workers = maxWorkers;
        
        this.#cache.dirty = true;
        this.broadcast();
        return amount;
    }

    hire(type, amount = null) {
        const b = this.buildings[type];
        if (!b || b.count === 0) return 0;
        
        amount = amount ?? this.getActionPlan('hire', type).actual;
        if (amount <= 0) return 0;
        
        b.workers = (b.workers || 0) + amount;
        this.#cache.dirty = true;
        this.broadcast();
        return amount;
    }

    furlough(type, amount = null) {
        const b = this.buildings[type];
        if (!b || !b.workers) return 0;
        
        amount = amount ?? this.getActionPlan('furlough', type).actual;
        if (amount <= 0) return 0;
        
        b.workers = Math.max(0, b.workers - amount);
        this.#cache.dirty = true;
        this.broadcast();
        return amount;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTION PLANNING
    // ═══════════════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════════════
    // GAME LOOP
    // ═══════════════════════════════════════════════════════════════════════════

    tick(dt) {
        this.recalculate();
        
        // Check worker strike
        const foodRate = this.#cache.rates.get('food') || 0;
        const foodDrain = foodRate < 0 ? Math.abs(foodRate) : 0;
        const food = this.resources.food;
        this.workersOnStrike = food && food.value.lt(foodDrain) && food.netGrowthRate.toNumber() < 0;

        for (const resource of Object.values(this.resources)) {
            resource.update(dt);
        }
    }

    broadcast() {
        for (const [res, resource] of Object.entries(this.resources)) {
            const rate = this.#cache.rates.get(res);
            resource.rate = new Decimal(rate || 0);
        }
        this.core.ui.panels.industry.render(this.getData());
    }

    updateLoops() {
        if (this.core.ui.activePanels.center === "industry" && !this.#loops.industry) {
            this.broadcast();
            this.#loops.industry = this.core.ui.createRenderInterval(() => this.broadcast());
        } else if (this.core.ui.activePanels.center !== "industry") {
            this.core.ui.destroyRenderInterval(this.#loops.industry);
            this.#loops.industry = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BOOT / SERIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    boot() {
        if (this.access.basic) {
            document.querySelector("#industrynav").classList.remove("locked");
        }
        if (this.configs.resourceBoxExpanded) {
            this.core.ui.panels.industry.toggleView();
        }
        this.#setupGrowthFns();
        this.#setupAllUpgrades();
    }

    #setupAllUpgrades() {
        this.#setupWisdomUpgrade();
    }

    #setupTest() {
        // Test upgrade: +3 to all effects (for testing only)
        this.upgrade((ctx) => {
            return {
                add: 3,
                modifiers: [{ value: '+3', label: 'test' }]
            };
        });
    }

    #setupWisdomUpgrade() {
        // Wisdom only affects production, not inputs/pay/costs
        this.upgrade((ctx) => {
            if (ctx.tag !== 'prod') return null;
            const wisdom = this.core.city?.ruler?.wisdom || 0;
            if (wisdom === 0) return null;
            const mult = 1 + wisdom * 0.01;
            return {
                mult,
                modifiers: [{ value: `x${mult}`, label: 'wisdom' }]
            };
        });
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

    // ═══════════════════════════════════════════════════════════════════════════
    // THEURGY (Manual actions)
    // ═══════════════════════════════════════════════════════════════════════════

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

    // ═══════════════════════════════════════════════════════════════════════════
    // QUERY HELPERS 
    // ═══════════════════════════════════════════════════════════════════════════

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
        if (this.getActionPlan('build', type).actual > 0) return '';
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return '';
        
        const missing = Object.entries(def.buildCost)
            .map(([res, cost]) => {
                const have = this.resources[res]?.value.toNumber() || 0;
                return have < cost ? `${res} (need ${this.core.ui.formatNumber(cost)}, have ${this.core.ui.formatNumber(have, { wholeNumbersOnly: true })})` : null;
            })
            .filter(Boolean);
        return missing.length ? `Not enough: ${missing.join(', ')}` : 'Cannot build';
    }

    getDemolishDisabledReason(type) {
        return this.getActionPlan('sell', type).actual > 0 ? '' : 'No buildings to demolish';
    }

    getHireDisabledReason(type) {
        if (this.getActionPlan('hire', type).actual > 0) return '';
        const b = this.buildings[type];
        if (!b?.count) return 'No buildings';
        if (this.getMaxWorkers(type) <= (b.workers || 0)) return `Worker limit reached (${this.getMaxWorkers(type)})`;
        if (this.unassignedWorkers <= 0) return 'No available workers';
        return 'Cannot hire';
    }

    getFurloughDisabledReason(type) {
        return this.getActionPlan('furlough', type).actual > 0 ? '' : 'No workers to furlough';
    }

    isBuildingUnlocked(type) { return this.isUnlocked(type); }
    unlockBuilding(type) { return this.unlock(type); }
    buildBuilding(type) { return this.build(type); }
    sellBuilding(type) { return this.sell(type); }
    assignWorkerToBuilding(type) { return this.hire(type); }
    unassignWorkerFromBuilding(type) { return this.furlough(type); }
    cycleActionIncrement() { return this.cycleIncrement(); }
    getWorkerScalingFactor() { return this.getWorkerScale(); }
    getBottleneckResources() { return this.getBottlenecks(); }
    isMultiIncrement() { const i = this.getSelectedIncrement(); return i === 'max' || i > 1; }
    getNetRate(res) {
        return new Decimal(this.#cache.rates.get(res) || 0);
    }
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


