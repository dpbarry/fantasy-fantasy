import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    static BUILDING_DEFS = {
        farmPlot: {
            name: "Farm Plot",
            effects: {
                crops: {base: {gain: 0.5}, worker: {drain: 0.5}},
                food: {worker: {gain: 0.5, drain: 0.2}},
            },
            buildCost: {crops: 10},
            sellReward: {crops: 5},
        },
        treePlantation: {
            name: "Tree Plantation",
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

    constructor(core) {
        this.core = core;
        this.access = {basic: false};
        this.resources = {
            workers: new Resource(10, {cap: 20, isDiscovered: true}),
            crops: new Resource(0, {isDiscovered: true}),
            food: new Resource(0, {isDiscovered: true}),
            trees: new Resource(0),
            wood: new Resource(0),
            gold: new Resource(0),
        };
        this.workersOnStrike = false;
        this.configs = {resourceBoxExpanded: true, actionIncrement: 1};
        this.buildings = {};
        this.initializeBuildings();
    }

    initializeBuildings() {
        for (const type in IndustryManager.BUILDING_DEFS) {
            this.buildings[type] = this.createBuildingData(type);
        }
    }

    createBuildingData(type) {
        return {count: 0, workers: 0, upgrades: {}, dropped: false, unlocked: type === 'farmPlot'};
    }

    getSelectedIncrement() {
        const value = this.configs?.actionIncrement;
        if (value === 'max') return 'max';
        const num = Number(value);
        if (!Number.isFinite(num) || num < 1) return 1;
        return Math.floor(num);
    }

    setSelectedIncrement(step) {
        const valid = IndustryManager.ACTION_STEPS.includes(step) ? step : 1;
        this.configs.actionIncrement = valid;
    }

    cycleActionIncrement() {
        const steps = IndustryManager.ACTION_STEPS;
        const current = this.getSelectedIncrement();
        const idx = steps.findIndex(s => s === current);
        const next = steps[(idx + 1) % steps.length];
        this.setSelectedIncrement(next);
        this.broadcast();
        return next;
    }

    getActionPlan(action, type) {
        const limit = Math.max(0, Math.floor(this.getActionLimit(action, type)));
        const selected = this.getSelectedIncrement();
        let target;
        if (selected === 'max') {
            target = Math.max(1, limit);
        } else {
            target = Math.max(1, selected);
        }
        const actual = selected === 'max' ? limit : Math.min(limit, target);
        return {selected, target, actual, limit};
    }

    getActionLimit(action, type) {
        const b = this.buildings[type];
        switch (action) {
            case 'build':
                return this.getMaxBuildCount(type);
            case 'sell':
                return b ? b.count : 0;
            case 'hire':
                if (!b || b.count === 0) return 0;
                return this.unassignedWorkers;
            case 'furlough':
                return b && b.workers ? b.workers : 0;
            default:
                return 0;
        }
    }

    getMaxBuildCount(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || !def.buildCost) return Number.MAX_SAFE_INTEGER;
        let max = Infinity;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const resObj = this.resources[res];
            if (!resObj) return 0;
            const costNum = cost && typeof cost.toNumber === 'function' ? cost.toNumber() : Number(cost || 0);
            if (costNum <= 0) continue;
            const current = resObj.value.toNumber();
            const possible = Math.floor(current / costNum);
            if (possible < max) max = possible;
        }
        if (max === Infinity) return Number.MAX_SAFE_INTEGER;
        if (!Number.isFinite(max) || max < 0) return 0;
        return max;
    }

    static multiplyValue(value, amount) {
        if (value && typeof value.times === 'function') {
            return value.times(amount);
        }
        if (value && typeof value.toNumber === 'function') {
            return value.toNumber() * amount;
        }
        return (value || 0) * amount;
    }

    getBaseRate(resName) {
        let total = 0;
        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def || !def.effects || !def.effects[resName]) continue;
            const base = def.effects[resName].base;
            if (base) {
                if (base.gain) total += b.count * base.gain;
                if (base.drain) total -= b.count * base.drain;
            }
        }
        return new Decimal(total);
    }

    getRawWorkerRate(resName) {
        let total = 0;
        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def || !def.effects || !def.effects[resName]) continue;
            const worker = def.effects[resName].worker;
            if (worker) {
                if (worker.gain) total += b.workers * worker.gain;
                if (worker.drain) total -= b.workers * worker.drain;
            }
        }
        return new Decimal(total);
    }

    getWorkerScalingFactor() {
        if (this.workersOnStrike) return 0;
        
        let minScale = 1;
        for (const resName in this.resources) {
            const workerRate = this.getRawWorkerRate(resName);
            if (workerRate.lt(0)) {
                const desiredDrain = Math.abs(workerRate.toNumber());
                if (desiredDrain === 0) continue;
                
                const currentValue = this.resources[resName].value.toNumber();
                if (currentValue > 0) {
                    continue;
                }
                
                const baseRate = this.getBaseRate(resName);
                const baseProduction = baseRate.toNumber();
                const scale = baseProduction / desiredDrain;
                
                if (scale < minScale) {
                    minScale = scale;
                }
            }
        }
        return Math.max(0, Math.min(1, minScale));
    }

    getEffectiveWorkerRate(resName) {
        if (this.workersOnStrike) return new Decimal(0);
        const rawRate = this.getRawWorkerRate(resName);
        if (rawRate.eq(0)) return rawRate;
        
        const scale = this.getWorkerScalingFactor();
        return rawRate.times(scale);
    }

    setupGrowthFns() {
        for (const resName in this.resources) {
            const resource = this.resources[resName];
            if (!resource) continue;
            resource.growthFns = {};
            resource.addGrowthFn('buildingBase', () => this.getBaseRate(resName));
            resource.addGrowthFn('buildingWorker', () => this.getEffectiveWorkerRate(resName));
        }
    }

    boot() {
        if (this.access.basic) {
            document.querySelector("#industrynav").classList.remove("locked");
        }

        if (this.configs.resourceBoxExpanded) {
            this.core.ui.panels.industry.toggleView();
        }
        this.setupGrowthFns();
    }

    performTheurgy(theurgyType) {
        let changes = [];
        switch (theurgyType) {
            case "plant":
                this.resources.crops.add(1);
                changes.push({type: "gain", amt: 1, res: "crops"});
                break;
            case "harvest":
                if (this.resources.crops.value.gte(1)) {
                    this.resources.crops.subtract(1);
                    this.resources.food.add(1);
                    changes.push({type: "drain", amt: 1, res: "crops"});
                    changes.push({type: "gain", amt: 1, res: "food"});
                }
                break;
        }
        this.broadcast();
        return changes;
    }

    canPerformTheurgy(theurgyType) {
        switch (theurgyType) {
            case "plant":
                return true;
            case "harvest":
                return this.resources.crops.value.gte(1);
            default:
                return false;
        }
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

    tick(dt) {
        let totalFoodDrain = 0;
        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (def && def.effects && def.effects.food && def.effects.food.worker && def.effects.food.worker.drain) {
                totalFoodDrain += b.workers * def.effects.food.worker.drain;
            }
        }
        const foodResource = this.resources.food;
        const foodNetRate = foodResource ? foodResource.netGrowthRate.toNumber() : 0;
        this.workersOnStrike = foodResource && foodResource.value.lt(totalFoodDrain) && foodNetRate < 0;

        Object.values(this.resources).forEach(resource => {
            resource.update(dt);
        });
    }

    broadcast() {
        Object.entries(this.resources).forEach(([resName, resource]) => {
            const baseRate = this.getBaseRate(resName);
            const workerRate = this.getEffectiveWorkerRate(resName);
            resource.rate = baseRate.plus(workerRate);
        });
        this.core.ui.panels.industry.render(this.getStatus());
    }

    getStatus() {
        return {
            ...this,
            resources: Object.fromEntries(Object.entries(this.resources).filter(([, value]) => value.isDiscovered))
        }
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
            for (let [k, rd] of Object.entries(resources)) {
                this.resources[k] = Resource.deserialize(rd);
            }
        }
        if (buildings) {
            for (const [type, bData] of Object.entries(buildings)) {
                if (this.buildings[type]) {
                    Object.assign(this.buildings[type], bData);
                } else {
                    this.buildings[type] = {...this.createBuildingData(type), ...bData};
                }
            }
        }
        Object.assign(this, rest);
        this.setupGrowthFns();
        
        if (savedTimestamp && this.core.settings.configs.offlineprogress === "on") {
            const offlineTime = Math.min((Date.now() - savedTimestamp) / 1000, 86400);
            if (offlineTime > 0) {
                this.tick(offlineTime);
            }
        }
        
        this.broadcast();
    }

    get unassignedWorkers() {
        const assigned = Object.values(this.buildings).reduce((a, b) => a + (b.workers || 0), 0);
        return Math.max(0, Math.floor(this.resources.workers.value.toNumber() - assigned));
    }

    buildBuilding(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def || !b) return 0;

        const amount = this.getActionPlan('build', type).actual;
        if (amount <= 0) return 0;

        if (!def.buildCost || Object.keys(def.buildCost).length === 0) {
            b.count += amount;
            this.broadcast();
            return amount;
        }

        const totals = {};
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const totalCost = IndustryManager.multiplyValue(cost, amount);
            totals[res] = totalCost;
            if (!this.resources[res] || this.resources[res].value.lt(totalCost)) {
                return 0;
            }
        }
        for (const [res, totalCost] of Object.entries(totals)) {
            this.resources[res].subtract(totalCost);
        }
        b.count += amount;
        this.broadcast();
        return amount;
    }

    sellBuilding(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!b || b.count <= 0) return 0;

        const amount = this.getActionPlan('sell', type).actual;
        if (amount <= 0) return 0;

        if (def && def.sellReward) {
            for (const [res, reward] of Object.entries(def.sellReward)) {
                if (this.resources[res]) {
                    const totalReward = IndustryManager.multiplyValue(reward, amount);
                    this.resources[res].add(totalReward);
                }
            }
        }

        b.count -= amount;
        if (b.count < 0) b.count = 0;
        this.broadcast();
        return amount;
    }

    assignWorkerToBuilding(type) {
        const b = this.buildings[type];
        if (!b || b.count === 0) return 0;
        const amount = this.getActionPlan('hire', type).actual;
        if (amount <= 0) return 0;
        b.workers = (b.workers || 0) + amount;
        this.broadcast();
        return amount;
    }

    unassignWorkerFromBuilding(type) {
        const b = this.buildings[type];
        if (!b || (b.workers || 0) <= 0) return 0;
        const amount = this.getActionPlan('furlough', type).actual;
        if (amount <= 0) return 0;
        b.workers -= amount;
        if (b.workers < 0) b.workers = 0;
        this.broadcast();
        return amount;
    }

    getBuildEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;

        const costs = [];
        if (def.buildCost) {
            Object.entries(def.buildCost).forEach(([res, amt]) => {
                costs.push({res, amt: amt.toNumber ? amt.toNumber() : amt});
            });
        }

        const effects = {};
        if (def.effects) {
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.base) continue;
                let net = 0;
                if (eff.base.gain) net += eff.base.gain.toNumber ? eff.base.gain.toNumber() : eff.base.gain;
                if (eff.base.drain) net -= eff.base.drain.toNumber ? eff.base.drain.toNumber() : eff.base.drain;
                if (net !== 0) {
                    effects[res] = net;
                }
            }
        }

        if (costs.length === 0 && Object.keys(effects).length === 0) return null;
        return {costs, effects};
    }

    getDemolishEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;

        const rewards = [];
        if (def.sellReward) {
            Object.entries(def.sellReward).forEach(([res, amt]) => {
                rewards.push({res, amt: amt.toNumber ? amt.toNumber() : amt});
            });
        }

        const effects = {};
        if (def.effects) {
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.base) continue;
                let net = 0;
                if (eff.base.gain) net -= eff.base.gain;
                if (eff.base.drain) net += eff.base.drain;
                if (net !== 0) {
                    effects[res] = net;
                }
            }
        }

        if (rewards.length === 0 && Object.keys(effects).length === 0) return null;
        return {rewards, effects};
    }

    getHireWorkerEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || !def.effects) return null;

        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (!eff.worker) continue;
            let net = 0;
            if (eff.worker.gain) net += eff.worker.gain.toNumber ? eff.worker.gain.toNumber() : eff.worker.gain;
            if (eff.worker.drain) net -= eff.worker.drain.toNumber ? eff.worker.drain.toNumber() : eff.worker.drain;
            if (net !== 0) {
                effects[res] = net;
            }
        }

        if (Object.keys(effects).length === 0) return null;
        return {effects};
    }

    getFurloughWorkerEffects(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || !def.effects) return null;

        const effects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (!eff.worker) continue;
            let net = 0;
            if (eff.worker.gain) net -= eff.worker.gain;
            if (eff.worker.drain) net += eff.worker.drain;
            if (net !== 0) {
                effects[res] = net;
            }
        }

        if (Object.keys(effects).length === 0) return null;
        return {effects};
    }

    isBuildingUnlocked(type) {
        return this.buildings[type]?.unlocked === true;
    }

    unlockBuilding(type) {
        const b = this.buildings[type];
        if (!b || b.unlocked) return false;
        b.unlocked = true;
        this.broadcast();
        return true;
    }
}

class Resource {
    constructor(initialValue = 0, options = {}) {
        this.value = new Decimal(initialValue);
        this.cap = options.cap !== undefined ? new Decimal(options.cap) : undefined;
        this.growthFns = {}; // { key: () => Decimal }
        this.isDiscovered = options.isDiscovered || false;
    }

    addGrowthFn(key, fn) {
        this.growthFns[key] = fn;
    }

    removeGrowthFn(key) {
        delete this.growthFns[key];
    }

    get netGrowthRate() {
        let rate = new Decimal(0);
        for (const fn of Object.values(this.growthFns)) {
            rate = rate.plus(fn());
        }
        return rate;
    }

    update(dt) {
        const growth = this.netGrowthRate.times(dt);
        this.value = this.value.plus(growth);
        if (this.cap !== undefined && this.value.gt(this.cap)) {
            this.value = this.cap;
        }
        if (this.value.lt(0)) {
            this.value = new Decimal(0);
        }
    }

    add(v) {
        this.value = this.value.plus(v);
    }

    subtract(v) {
        this.value = this.value.minus(v);
        if (this.value.lt(0)) {
            this.value = new Decimal(0);
        }
    }

    setValue(v) {
        this.value = new Decimal(v);
    }

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
