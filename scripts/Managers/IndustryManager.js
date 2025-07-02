import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    #loops = {};

    constructor(core) {
        this.core = core;
        this.access = { basic: false };
        this.resources = {
            seeds: new Resource(0),
            crops: new Resource(0),
            food: new Resource(0),
            gold: new Resource(0),
            workers: new Resource(10, { cap: 20, baseGrowthRate: 0.05 }),
        };
        this.workerJobs = {
            forager: 0,
            planter: 0,
            harvester: 0
        };
        this.workersOnStrike = false;
        this.configs = { resourceBoxExpanded: true };
        this.updateJobGrowthModifiers();
    }

    boot() {
        if (this.access.basic) {
            document.querySelector("#industrynav").classList.remove("locked");
        }

        if (this.configs.resourceBoxExpanded) {
            this.core.ui.panels.industry.toggleView();
        }
    }

    performTheurgy(theurgyType) {
        let success = false;

        switch (theurgyType) {
            case "forage":
                this.resources.seeds.add(1);
                success = true;
                break;
            case "plant":
                if (this.resources.seeds.value.gte(1)) {
                    this.resources.seeds.subtract(1);
                    this.resources.crops.add(1);
                    success = true;
                }
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
            case "forage":
                return true;
            case "plant":
                return this.resources.seeds.value.gte(1);
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

    updateJobGrowthModifiers() {
        // Remove previous job modifiers
        this.resources.seeds.removeGrowthModifier('job');
        this.resources.crops.removeGrowthModifier('job');
        this.resources.food.removeGrowthModifier('job');
        // Calculate new job-based growth
        let forager = this.workerJobs.forager;
        let planter = this.workerJobs.planter;
        let harvester = this.workerJobs.harvester;
        // If on strike, no job production
        if (this.workersOnStrike) {
            forager = 0; planter = 0; harvester = 0;
        }
        // Job rates
        // Forager: +seeds
        // Planter: -seeds, +crops
        // Harvester: -crops, +food
        const seedsRate = (forager * 0.2) + (planter * -0.2);
        const cropsRate = (planter * 0.2) + (harvester * -0.2);
        const foodRate = (harvester * 0.3) + (forager * -0.1) + (planter * -0.15);
        this.resources.seeds.addGrowthModifier('job', 'add', seedsRate);
        this.resources.crops.addGrowthModifier('job', 'add', cropsRate);
        this.resources.food.addGrowthModifier('job', 'add', foodRate);
    }

    tick(dt) {
        // Calculate if on strike
        let foodDrain = 0;
        const jobDefs = {
            forager: { food: 0.1 },
            planter: { food: 0.15 },
            harvester: { food: 0.2 }
        };
        Object.entries(this.workerJobs).forEach(([job, count]) => {
            if (count > 0) {
                foodDrain += jobDefs[job].food * count;
            }
        });
        this.workersOnStrike = !!this.resources.food.value.lt(foodDrain);
        this.updateJobGrowthModifiers();
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
        return { ...this };
    }

    serialize() {
        const { core, ...rest } = this;
        rest.resources = Object.fromEntries(
            Object.entries(this.resources).map(([k, r]) => [k, r.serialize()])
        );
        return rest;
    }

    deserialize(data) {
        const { resources, ...rest } = data;
        if (resources) {
            for (let [k, rd] of Object.entries(resources)) {
                this.resources[k] = Resource.deserialize(rd);
            }
        }
        Object.assign(this, rest);
    }

    assignWorker(job) {
        if (this.unassignedWorkers() > 0 && this.workerJobs[job] !== undefined) {
            this.workerJobs[job]++;
            this.updateJobGrowthModifiers();
            this.broadcast();
        }
    }

    unassignWorker(job) {
        if (this.workerJobs[job] > 0) {
            this.workerJobs[job]--;
            this.updateJobGrowthModifiers();
            this.broadcast();
        }
    }

    unassignedWorkers() {
        const assigned = Object.values(this.workerJobs).reduce((a, b) => a + b, 0);
        return Math.max(0, Math.floor(this.resources.workers.value.toNumber() - assigned));
    }
}


class Resource {
    static growthRegistry = {};

    static registerGrowthModifier(id, fnFactory) {
        Resource.growthRegistry[id] = fnFactory;
    }

    constructor(initialValue = 0, options = {}) {
        this.value = new Decimal(initialValue);
        this.baseGrowthRate = options.baseGrowthRate !== undefined ? new Decimal(options.baseGrowthRate) : new Decimal(0);
        this.growthModifiers = {};
        this.growthModifierIDs = new Set();
        this.consumptionRate = new Decimal(0); // per second
        this.cap = options.cap !== undefined ? new Decimal(options.cap) : undefined;
    }

    addGrowthModifier(id, type, value) {
        this.growthModifiers[id] = { type, value: new Decimal(value) };
    }

    updateGrowthModifier(id, newValue) {
        if (this.growthModifiers[id]) {
            this.growthModifiers[id].value = new Decimal(newValue);
        }
    }

    removeGrowthModifier(id) {
        delete this.growthModifiers[id];
        this.growthModifierIDs.delete(id);
    }

    addDynamicGrowthModifier(id) {
        const fnFactory = Resource.growthRegistry[id];
        if (!fnFactory) return;
        this.growthModifiers[id] = fnFactory;
        this.growthModifierIDs.add(id);
    }

    get effectiveGrowthRate() {
        let rate = this.baseGrowthRate;

        Object.values(this.growthModifiers).forEach(m => {
            if (typeof m === 'object' && m.type && m.value) {
                if (m.type === "add") {
                    rate = rate.plus(m.value);
                } else if (m.type === "mult") {
                    rate = rate.times(m.value);
                } else if (m.type === "exp") {
                    rate = rate.pow(m.value);
                }
            }
        });

        Object.values(this.growthModifiers).forEach(m => {
            if (typeof m === 'function') {
                const modifier = m();
                if (modifier && modifier.type && modifier.value) {
                    if (modifier.type === "add") {
                        rate = rate.plus(modifier.value);
                    } else if (modifier.type === "mult") {
                        rate = rate.times(modifier.value);
                    } else if (modifier.type === "exp") {
                        rate = rate.pow(modifier.value);
                    }
                }
            }
        });

        return rate;
    }

    get netGrowthRate() {
        return this.effectiveGrowthRate.minus(this.consumptionRate);
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

    setValue(v) {
        this.value = new Decimal(v);
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

    setGrowthRate(rate) {
        this.baseGrowthRate = new Decimal(rate);
    }

    setConsumptionRate(rate) {
        this.consumptionRate = new Decimal(rate);
    }

    reset() {
        this.value = new Decimal(0);
        this.baseGrowthRate = new Decimal(0);
        this.consumptionRate = new Decimal(0);
        this.growthModifiers = {};
        this.growthModifierIDs.clear();
    }

    serialize() {
        return {
            value: this.value.toString(),
            baseGrowthRate: this.baseGrowthRate.toString(),
            consumptionRate: this.consumptionRate.toString(),
            cap: this.cap !== undefined ? this.cap.toString() : undefined,
            growthModifiers: Object.fromEntries(
                Object.entries(this.growthModifiers).map(([id, m]) => [id, {
                    type: m.type,
                    value: m.value.toString()
                }])
            ),
            growthModifierIDs: Array.from(this.growthModifierIDs)
        };
    }

    static deserialize(data) {
        const options = {};
        if (data.cap !== undefined) options.cap = data.cap;
        const res = new Resource(data.value, options);
        res.baseGrowthRate = new Decimal(data.baseGrowthRate || 0);
        res.consumptionRate = new Decimal(data.consumptionRate || 0);
        if (data.growthModifiers) {
            for (let [id, m] of Object.entries(data.growthModifiers)) {
                res.growthModifiers[id] = {
                    type: m.type,
                    value: new Decimal(m.value)
                };
            }
        }
        if (Array.isArray(data.growthModifierIDs)) {
            for (let id of data.growthModifierIDs) {
                res.addDynamicGrowthModifier(id);
            }
        }
        return res;
    }
}
