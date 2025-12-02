import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    static BUILDING_DEFS = {
        farmPlot: {
            name: "Farm Plot",
            lore: "An arable patch of land",
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
            lore: "A thicket of hearty trees",
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

    // Add an upgrade function. Returns a removal function.
    // Upgrades receive context and can return: {gain, drain, addGain, addDrain, gainMult, drainMult}
    // Meta-upgrades check for upgradeFn/upgradeResult in context to target other upgrades
    // Optional filters: {buildingTypes?: string[], resources?: string[], effectTypes?: string[]}
    // Optional priority: lower numbers apply first (default: 100)
    upgrade(fn, filters = null, priority = 100) {
        const entry = {fn, filters, priority};
        this.#upgrades.add(entry);
        this.#cache.dirty = true;
        return () => {
            if (this.#upgrades.delete(entry)) {
                this.#cache.dirty = true;
            }
        };
    }

    #sortedUpgrades() {
        return Array.from(this.#upgrades).sort((a, b) => a.priority - b.priority);
    }

    #applies(entry, buildingType, resource, effectType) {
        if (!entry.filters) return true;
        const f = entry.filters;
        if (f.buildingTypes && !f.buildingTypes.includes(buildingType)) return false;
        if (f.resources && !f.resources.includes(resource)) return false;
        if (f.effectTypes && !f.effectTypes.includes(effectType)) return false;
        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RATE CALCULATION
    // ═══════════════════════════════════════════════════════════════════════════

    recalculate() {
        if (!this.#cache.dirty || this.#recalculating) return;
        
        this.#recalculating = true;
            const rates = new Map();
            const ctx = this.#createContext(rates);
            
            for (const [type, b] of Object.entries(this.buildings)) {
                const def = IndustryManager.BUILDING_DEFS[type];
                if (!def?.effects || b.count === 0) continue;
                
                for (const [res, eff] of Object.entries(def.effects)) {
                    if (eff.base) {
                        const rate = this.#computeRate(ctx, type, res, 'base', eff.base, b.count);
                        rates.set(res, (rates.get(res) || 0) + rate);
                    }
                    if (eff.worker && b.workers > 0) {
                        const rate = this.#computeRate(ctx, type, res, 'worker', eff.worker, b.workers);
                        rates.set(res, (rates.get(res) || 0) + rate);
                    }
                }
            }
            
            this.#cache.rates = rates;
            this.#cache.dirty = false;
            this.#recalculating = false;
        }
    

    #createContext(rates) {
        return {
            resources: this.resources,
            buildings: this.buildings,
            rate: (res) => rates.get(res) || 0,
            prevRate: (res) => this.#cache.rates.get(res) || 0,
            value: (res) => this.resources[res]?.value.toNumber() || 0,
            count: (type) => this.buildings[type]?.count || 0,
            workers: (type) => this.buildings[type]?.workers || 0,
            inSet: (type, set) => set.includes(type),
        };
    }

    #computeRate(ctx, buildingType, resource, effectType, eff, units) {
        let gain = eff.gain || 0;
        let drain = eff.drain || 0;
        let gainMult = 1;
        let drainMult = 1;
        
        ctx.buildingType = buildingType;
        ctx.resource = resource;
        ctx.effectType = effectType;
        ctx.units = units;
        
        for (const entry of this.#sortedUpgrades()) {
            if (!this.#applies(entry, buildingType, resource, effectType)) continue;
            // Skip if this is a meta-upgrade (checks for upgradeResult)
            if (ctx.upgradeResult !== undefined) continue;
            
            const upgradeFn = entry.fn;
            ctx.gain = gain;
            ctx.drain = drain;
            ctx.gainMult = gainMult;
            ctx.drainMult = drainMult;
            
            let mod = upgradeFn(ctx);
            if (!mod) continue;
            
            // Apply meta-upgrades to this result
            mod = this.#applyMetaUpgrades(mod, entry, ctx);
            
            if (mod.gain !== undefined) gain = mod.gain;
            if (mod.drain !== undefined) drain = mod.drain;
            if (mod.addGain !== undefined) gain += mod.addGain;
            if (mod.addDrain !== undefined) drain += mod.addDrain;
            if (mod.gainMult !== undefined) gainMult *= mod.gainMult;
            if (mod.drainMult !== undefined) drainMult *= mod.drainMult;
        }
        
        return (gain * gainMult - drain * drainMult) * units;
    }

    #applyMetaUpgrades(mod, sourceEntry, ctx) {
        let current = mod;
        for (const entry of this.#sortedUpgrades()) {
            if (entry === sourceEntry) continue;
            
            // Get what upgrade returns in normal context
            const normalCtx = {...ctx};
            normalCtx.gain = ctx.gain;
            normalCtx.drain = ctx.drain;
            normalCtx.mult = ctx.mult;
            const normalResult = entry.fn(normalCtx);
            
            // Get what it returns in meta context
            const metaCtx = {...ctx, upgradeFn: sourceEntry.fn, upgradeResult: current};
            const metaResult = entry.fn(metaCtx);
            
            // Only apply if meta result differs from normal result (meaning it used upgradeResult)
            if (metaResult && this.#resultsDiffer(metaResult, normalResult)) {
                current = metaResult;
            }
        }
        return current;
    }

    #resultsDiffer(a, b) {
        if (!a && !b) return false;
        if (!a || !b) return true;
        const keys = ['gain', 'drain', 'addGain', 'addDrain', 'gainMult', 'drainMult'];
        for (const key of keys) {
            if (a[key] !== b[key]) return true;
        }
        return false;
    }

    getRate(res) {
        this.recalculate();
        return this.#cache.rates.get(res) || 0;
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
                if (eff?.base?.gain) {
                    const {gain} = this.#computeEffectiveEffects(type, res, 'base', eff.base.gain, 0, b.count);
                    production += gain;
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
        this.recalculate();
        const scale = this.getWorkerScale();
        
        for (const [res, resource] of Object.entries(this.resources)) {
            const rate = this.#cache.rates.get(res) || 0;
            resource.rate = new Decimal(this.workersOnStrike ? (rate > 0 ? rate : 0) : rate * (rate < 0 ? scale : 1));
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
        this.#setupWisdomUpgrade();
    }

    #setupWisdomUpgrade() {
        this.upgrade(ctx => {
            const wisdom = this.core.city?.ruler?.wisdom || 0;
            if (wisdom <= 0) return null;
            return {gainMult: 1 + wisdom * 0.01};
        }, null, 50);
    }

    #setupGrowthFns() {
        for (const [res, resource] of Object.entries(this.resources)) {
            resource.growthFns = {};
            resource.addGrowthFn('industry', () => {
                this.recalculate();
                const rate = this.#cache.rates.get(res) || 0;
                const scale = this.getWorkerScale();
                return new Decimal(this.workersOnStrike ? (rate > 0 ? rate : 0) : rate * (rate < 0 ? scale : 1));
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
    // QUERY HELPERS - For UI (kept minimal)
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

    // Effects for UI display
    getBuildEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;
        const costs = def.buildCost ? Object.entries(def.buildCost).map(([res, amt]) => ({res, amt})) : [];
        const effects = {};
        const capChanges = {};
        if (def.effects) {
            for (const [res, eff] of Object.entries(def.effects)) {
                if (eff.base) {
                    const baseGain = eff.base.gain || 0;
                    const baseDrain = eff.base.drain || 0;
                    const {gain, drain} = this.#computeEffectiveEffects(type, res, 'base', baseGain, baseDrain, 1);
                    const net = gain - drain;
                    if (net !== 0) effects[res] = net;
                }
            }
        }
        if (def.capIncrease) {
            for (const [res, increase] of Object.entries(def.capIncrease)) {
                capChanges[res] = increase;
            }
        }
        if (def.workersPerBuilding) capChanges.workers = def.workersPerBuilding;
        return (costs.length || Object.keys(effects).length || Object.keys(capChanges).length) ? {costs, effects, capChanges} : null;
    }

    getDemolishEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;
        const rewards = def.sellReward ? Object.entries(def.sellReward).map(([res, amt]) => ({res, amt})) : [];
        const effects = {};
        const capChanges = {};
        if (def.effects) {
            for (const [res, eff] of Object.entries(def.effects)) {
                if (eff.base) {
                    const baseGain = eff.base.gain || 0;
                    const baseDrain = eff.base.drain || 0;
                    const {gain, drain} = this.#computeEffectiveEffects(type, res, 'base', baseGain, baseDrain, 1);
                    const net = drain - gain;
                    if (net !== 0) effects[res] = net;
                }
            }
        }
        if (def.capIncrease) {
            for (const [res, increase] of Object.entries(def.capIncrease)) {
                capChanges[res] = -increase;
            }
        }
        if (def.workersPerBuilding) capChanges.workers = -def.workersPerBuilding;
        return (rewards.length || Object.keys(effects).length || Object.keys(capChanges).length) ? {rewards, effects, capChanges} : null;
    }

    getHireWorkerEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.effects) return null;
        const scale = this.getWorkerScale();
        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (eff.worker) {
                const baseGain = eff.worker.gain || 0;
                const baseDrain = eff.worker.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, res, 'worker', baseGain, baseDrain, 1);
                const net = (gain - drain) * scale;
                if (net !== 0) effects[res] = net;
            }
        }
        return Object.keys(effects).length ? {effects} : null;
    }

    getFurloughWorkerEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.effects) return null;
        const scale = this.getWorkerScale();
        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (eff.worker) {
                const baseGain = eff.worker.gain || 0;
                const baseDrain = eff.worker.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, res, 'worker', baseGain, baseDrain, 1);
                const net = (drain - gain) * scale;
                if (net !== 0) effects[res] = net;
            }
        }
        return Object.keys(effects).length ? {effects} : null;
    }

    getAggregateBuildingEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const count = this.buildings[type]?.count || 0;
        if (!def?.effects || count === 0) return null;
        
        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (eff.base) {
                const baseGain = eff.base.gain || 0;
                const baseDrain = eff.base.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, res, 'base', baseGain, baseDrain, count);
                if (gain || drain) effects[res] = {gain, drain};
            }
        }
        return Object.keys(effects).length ? effects : null;
    }

    #computeEffectiveEffects(buildingType, resource, effectType, baseGain, baseDrain, units) {
        const rates = new Map();
        const ctx = this.#createContext(rates);
        
        let gain = baseGain;
        let drain = baseDrain;
        let gainMult = 1;
        let drainMult = 1;
        
        ctx.buildingType = buildingType;
        ctx.resource = resource;
        ctx.effectType = effectType;
        ctx.units = units;
        
        for (const entry of this.#sortedUpgrades()) {
            if (!this.#applies(entry, buildingType, resource, effectType)) continue;
            if (ctx.upgradeResult !== undefined) continue;
            
            const upgradeFn = entry.fn;
            ctx.gain = gain;
            ctx.drain = drain;
            ctx.gainMult = gainMult;
            ctx.drainMult = drainMult;
            
            let mod = upgradeFn(ctx);
            if (!mod) continue;
            
            mod = this.#applyMetaUpgrades(mod, entry, ctx);
            
            if (mod.gain !== undefined) gain = mod.gain;
            if (mod.drain !== undefined) drain = mod.drain;
            if (mod.addGain !== undefined) gain += mod.addGain;
            if (mod.addDrain !== undefined) drain += mod.addDrain;
            if (mod.gainMult !== undefined) gainMult *= mod.gainMult;
            if (mod.drainMult !== undefined) drainMult *= mod.drainMult;
        }
        
        return {
            gain: gain * units * gainMult,
            drain: drain * units * drainMult
        };
    }

    getAggregateWorkerEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const workers = this.buildings[type]?.workers || 0;
        if (!def?.effects || workers === 0) return null;
        
        const scale = this.getWorkerScale();
        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (eff.worker) {
                const baseGain = eff.worker.gain || 0;
                const baseDrain = eff.worker.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, res, 'worker', baseGain, baseDrain, workers);
                const net = (gain - drain) * scale;
                if (net !== 0) effects[res] = net;
            }
        }
        return Object.keys(effects).length ? effects : null;
    }

    getBuildEffectsForIncrement(type, increment) {
        const result = this.getBuildEffects(type);
        if (!result) return null;
        const multiplier = increment === 'max' ? this.getActionPlan('build', type).actual : increment;
        const effects = {};
        for (const [res, val] of Object.entries(result.effects || {})) {
            effects[res] = val * multiplier;
        }
        return Object.keys(effects).length ? {effects} : null;
    }

    getResourceProductionBreakdown(resource) {
        if (!this.resources[resource]) return null;
        const breakdown = {
            baseGain: 0,
            baseDrain: 0,
            workerGain: 0,
            workerDrain: 0,
            byBuilding: {}
        };
        const scale = this.getWorkerScale();
        
        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects?.[resource]) continue;
            
            const eff = def.effects[resource];
            const buildingData = {baseGain: 0, baseDrain: 0, workerGain: 0, workerDrain: 0};
            
            if (eff.base && b.count > 0) {
                const baseGain = eff.base.gain || 0;
                const baseDrain = eff.base.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, resource, 'base', baseGain, baseDrain, b.count);
                buildingData.baseGain = gain;
                buildingData.baseDrain = drain;
                breakdown.baseGain += gain;
                breakdown.baseDrain += drain;
            }
            
            if (eff.worker && b.workers > 0) {
                const baseGain = eff.worker.gain || 0;
                const baseDrain = eff.worker.drain || 0;
                const {gain, drain} = this.#computeEffectiveEffects(type, resource, 'worker', baseGain, baseDrain, b.workers);
                buildingData.workerGain = gain * scale;
                buildingData.workerDrain = drain * scale;
                breakdown.workerGain += buildingData.workerGain;
                breakdown.workerDrain += buildingData.workerDrain;
            }
            
            if (buildingData.baseGain || buildingData.baseDrain || buildingData.workerGain || buildingData.workerDrain) {
                breakdown.byBuilding[type] = buildingData;
            }
        }
        
        return breakdown;
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
        const target = plan.selected === 'max' ? plan.actual : Math.min(availableSlots, plan.target || 1);
        const have = this.unassignedWorkers;
        
        if (target <= 0) return 0;
        return Math.max(0, Math.min(1, have / target));
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
            .filter(([res, cost]) => (this.resources[res]?.value.toNumber() || 0) < cost)
            .map(([res, cost]) => `${res} (need ${cost})`);
        return missing.length ? `Not enough: ${missing.join(', ')}` : 'Cannot build';
    }

    getDemolishDisabledReason(type) {
        return this.getActionPlan('sell', type).actual > 0 ? '' : 'No buildings';
    }

    getHireDisabledReason(type) {
        if (this.getActionPlan('hire', type).actual > 0) return '';
        const b = this.buildings[type];
        if (!b?.count) return 'No buildings';
        if (this.getMaxWorkers(type) <= (b.workers || 0)) return 'Worker limit reached';
        if (this.unassignedWorkers <= 0) return 'No available workers';
        return 'Cannot hire';
    }

    getFurloughDisabledReason(type) {
        return this.getActionPlan('furlough', type).actual > 0 ? '' : 'No workers';
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
    getEffectiveCap(res) { return this.getCap(res); }
    getBaseRate(res) { this.recalculate(); return new Decimal(this.#cache.rates.get(res) || 0); }
    getRawWorkerRate() { return new Decimal(0); }
    getEffectiveWorkerRate() { return new Decimal(0); }
    isMultiIncrement() { const i = this.getSelectedIncrement(); return i === 'max' || i > 1; }
    invalidateCache() { this.#cache.dirty = true; }
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
