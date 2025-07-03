import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    static BUILDING_DEFS = {
        cropPlot: {
            name: "Farm Plot",
            effects: {
                crops: {base: {gain: 0.5}, worker: {drain: 0.5}},
                food: {worker: {gain: 0.5, drain: 0.2}},
            },
            buildCost: {crops: 10},
        },
        treePlantation: {
            name: "Tree Plantation",
            effects: {
                trees: {base: {gain: 0.5}, worker: {drain: 0.5}},
                food: {worker: {drain: 0.2}},
                wood: {work: {gain: 0.5}}
            },
            buildCost: {trees: 25},
        }
    };

    #loops = {};

    constructor(core) {
        this.core = core;
        this.access = {basic: false};
        this.resources = {
            workers: new Resource(10, {cap: 20, isDiscovered: true}),
            crops: new Resource(0, {isDiscovered: true}),
            food: new Resource(0, {isDiscovered: true}),
            gold: new Resource(0),
        };
        this.workersOnStrike = false;
        this.configs = {resourceBoxExpanded: true};
        this.buildings = {};
        for (const type in IndustryManager.BUILDING_DEFS) {
            this.buildings[type] = {count: 0, workers: 0, upgrades: {}};
        }
    }

    setupGrowthFns() {
        for (const resName in this.resources) {
            this.resources[resName].addGrowthFn('buildingBase', () => {
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
            });
            this.resources[resName].addGrowthFn('buildingWorker', () => {
                let total = 0;
                if (!this.workersOnStrike) {
                    for (const [type, b] of Object.entries(this.buildings)) {
                        const def = IndustryManager.BUILDING_DEFS[type];
                        if (!def || !def.effects || !def.effects[resName]) continue;
                        const worker = def.effects[resName].worker;
                        if (worker) {
                            if (worker.gain) total += b.workers * worker.gain;
                            if (worker.drain) total -= b.workers * worker.drain;
                        }
                    }
                }
                return new Decimal(total);
            });
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
        let success = false;
        switch (theurgyType) {
            case "plant":
                this.resources.crops.add(1);
                success = true;
                break;
            case "harvest":
                if (this.resources.crops.value.gte(1)) {
                    this.resources.crops.subtract(1);
                    this.resources.food.add(1);
                    success = true;
                }
                break;
        }
        if (success) {
            this.broadcast();
        }
        return success;
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
            this.#loops.industry = setInterval(() => this.broadcast(),
                parseInt(this.core.settings.refreshUI));
        } else if (this.core.ui.activePanels.center !== "industry") {
            clearInterval(this.#loops.industry);
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
        this.workersOnStrike = !!this.resources.food.value.lt(totalFoodDrain);
        Object.values(this.resources).forEach(resource => {
            resource.update(dt);
        });
    }

    broadcast() {
        Object.values(this.resources).forEach(resource => {
            resource.rate = resource.netGrowthRate;
        });
        this.core.ui.panels.industry.render(this.getStatus());
    }

    getStatus() {
        return {
            ...this, resources: Object.fromEntries(Object.entries(this.resources).filter(([, value]) => value.isDiscovered))
        }
    }

    serialize() {
        const {core, ...rest} = this;
        rest.resources = Object.fromEntries(
            Object.entries(this.resources).map(([k, r]) => [k, r.serialize()])
        );
        return rest;
    }

    deserialize(data) {
        const {resources, ...rest} = data;
        if (resources) {
            for (let [k, rd] of Object.entries(resources)) {
                this.resources[k] = Resource.deserialize(rd);
            }
        }
        Object.assign(this, rest);
    }

    get unassignedWorkers() {
        const assigned = Object.values(this.buildings).reduce((a, b) => a + (b.workers || 0), 0);
        return Math.max(0, Math.floor(this.resources.workers.value.toNumber() - assigned));
    }

    buildBuilding(type) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def || !b) return false;
        for (let res in def.buildCost) {
            if (!this.resources[res] || this.resources[res].value.lt(def.buildCost[res])) return false;
        }
        for (let res in def.buildCost) {
            this.resources[res].subtract(def.buildCost[res]);
        }
        b.count++;
        this.broadcast();
        return true;
    }

    sellBuilding(type) {
        const b = this.buildings[type];
        if (!b || b.count <= 0) return false;
        b.count--;
        this.broadcast();
        return true;
    }

    assignWorkerToBuilding(type) {
        const b = this.buildings[type];
        if (!b) return false;
        if (this.unassignedWorkers <= 0) return false;
        b.workers++;
        this.broadcast();
        return true;
    }

    unassignWorkerFromBuilding(type) {
        const b = this.buildings[type];
        if (!b || b.workers <= 0) return false;
        b.workers--;
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
