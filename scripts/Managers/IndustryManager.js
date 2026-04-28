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

        const modifierRows = steps.map((step) => ({
            value: step.displayValue,
            label: step.label,
            scope: 'line',
            op: step.kind,
            source: step.source
        }));

        return {
            ...ctx,
            baseTotal: basePerUnit * units,
            perUnit,
            value: perUnit * units,
            modifiers: modifierRows.length > 0 ? modifierRows : undefined,
            trace: {
                rawPerUnit: basePerUnit,
                adjustedPerUnit: perUnit,
                units,
                steps,
                factors: modifierRows
            }
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
    
    #buildActionEffects(action, type, units) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def || units === 0) return [];
        
        const effects = [];
        const effectType = (action === 'build' || action === 'sell') ? 'base' : 'worker';
        const isRemoval = action === 'sell' || action === 'furlough';
        const buildingCount = this.buildings[type]?.count || 0;
        
        for (const [resource, eff] of Object.entries(def.effects || {})) {
            const effDef = eff[effectType];
            if (!effDef) continue;
            
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

    getActionEffects(action, type, options = {}) {
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def) return null;

        const plan = this.getActionPlan(action, type);
        const effectType = (action === 'build' || action === 'sell') ? 'base' : 'worker';
        const scale = effectType === 'worker' ? this.getWorkerScale() : 1;

        const forcedUnits = options.forceUnits ?? null;

            if ((action === 'sell' || action === 'furlough') && (plan.limit ?? 0) <= 0) {
            return null;
        }

        const units = forcedUnits ?? plan.actual;
        if (units <= 0) return null;

        const effects = this.#buildActionEffects(action, type, units);

        return { segment: 'action', plan, effects, scale, def, units, effectType };
    }

    getAggregateEffects(type, effectType) {
        const def = IndustryManager.BUILDING_DEFS[type];
        const b = this.buildings[type];
        if (!def?.effects) return null;

        const units = effectType === 'base' ? (b?.count || 0) : (b?.workers || 0);
        if (units === 0) return null;

        const scale = effectType === 'worker' ? this.getWorkerScale() : 1;
        const effects = this.#buildAggregateEffects(type, effectType, units);

        return effects.length ? { segment: 'aggregate', effects, units, scale, def, effectType } : null;
    }

    getResourceEffects(res) {
        if (!this.resources[res]) return null;

        const scale = this.getWorkerScale();
        const effects = [];
        let totalGain = 0, totalDrain = 0;

        for (const [type, b] of Object.entries(this.buildings)) {
            const def = IndustryManager.BUILDING_DEFS[type];
            if (!def?.effects?.[res]) continue;

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

        const resource = this.resources[res];
        const cap = resource?.effectiveCap;
        const isCapped = cap !== undefined && resource.value.gte(cap);
        const netFactors = isCapped ? [{ value: '×0', label: 'capped', scope: 'global', op: 'mul' }] : [];
        const rawNet = totalGain - totalDrain;
        const net = isCapped ? 0 : rawNet;

        return effects.length
            ? { segment: 'resource', effects, totalGain, totalDrain, rawNet, net, netFactors, isCapped, resource: res }
            : null;
    }



    getWorkerScale() {
        if (this.workersOnStrike) return 0;

        const workerDrains = new Map();
        for (const [type, b] of Object.entries(this.buildings)) {
            if (b.workers <= 0) continue;
            const workerEffects = this.#buildAggregateEffects(type, 'worker', b.workers);
            for (const effect of workerEffects) {
                if (effect.direction !== 'drain') continue;
                workerDrains.set(effect.resource, (workerDrains.get(effect.resource) || 0) + effect.value);
            }
        }

        if (workerDrains.size === 0) return 1;

        let minScale = 1;
        for (const [res, workerDrain] of workerDrains) {
            const val = this.resources[res]?.value.toNumber() || 0;
            if (val > 0) continue;

            let production = 0;
            for (const [type, b] of Object.entries(this.buildings)) {
                if (b.count <= 0) continue;
                const baseEffects = this.#buildAggregateEffects(type, 'base', b.count);
                for (const effect of baseEffects) {
                    if (effect.resource === res && effect.direction === 'gain') {
                        production += effect.value;
                    }
                }
            }

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

    getCap(res) {
        const resource = this.resources[res];
        if (!resource?.cap) return undefined;

        let cap = resource.cap.toNumber();
        for (const [type, b] of Object.entries(this.buildings)) {
            const increase = IndustryManager.BUILDING_DEFS[type]?.capIncrease?.[res];
            if (!increase || b.count <= 0) continue;
            const effect = this.#computeEffect({
                category: 'cap',
                resource: res,
                direction: 'gain',
                tag: 'cap',
                baseValue: increase,
                units: b.count,
                buildingType: type,
                effectType: 'base',
                buildingCount: b.count
            });
            cap += effect.value;
        }
        return new Decimal(cap);
    }

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
        if (this.getActionPlan('build', type).actual > 0) return '';
        const def = IndustryManager.BUILDING_DEFS[type];
        if (!def?.buildCost) return '';
        
        const missing = Object.entries(def.buildCost)
            .map(([res, cost]) => {
                const have = this.resources[res]?.value.toNumber() || 0;
                return have < cost ? `${this.core.ui.formatNumber(cost - have, {decimalPlaces: 0, roundUp: true})} more ${res}` : null;
            })
            .filter(Boolean);
        return missing.length ? `${missing.join(', ')}` : 'Cannot build';
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
    getCalculationSegment(segment, options = {}) {
        if (segment === 'action') {
            return this.getActionEffects(options.action, options.type, options);
        }
        if (segment === 'aggregate') {
            return this.getAggregateEffects(options.type, options.effectType);
        }
        if (segment === 'resource') {
            return this.getResourceEffects(options.resource);
        }
        return null;
    }
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


