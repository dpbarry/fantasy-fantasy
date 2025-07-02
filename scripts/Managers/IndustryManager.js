import Decimal from "../Services/break_infinity.esm.js";

class Resource {
    static growthRegistry = {};

    static registerGrowthModifier(id, fnFactory) {
        Resource.growthRegistry[id] = fnFactory;
    }

    constructor(initialValue = 0) {
        this.value = new Decimal(initialValue);
        this.baseGrowthRate = new Decimal(0); // per second
        this.growthModifiers = {};
        this.growthModifierIDs = new Set();
        this.consumptionRate = new Decimal(0); // per second
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
        const res = new Resource(data.value);
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
        };
    }

    boot() {
        if (this.access.basic) {
            document.querySelector("#industrynav").classList.remove("locked");
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
        } else if(this.core.ui.activePanels.center !== "industry") {
            clearInterval(this.#loops.industry);
            this.#loops.industry = null;
        }
    }
    
    tick(dt) {
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
        return {...this};
    }

    serialize() {
        const { core, ...rest } = this;
        rest.resources =  /** @type {typeof this.resources} */ Object.fromEntries(
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
}
