export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.defs = this.core.industry.constructor.BUILDING_DEFS;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
        this.previousRates = {};
        this.previousBuildingState = {};
        this.incrementBtn = null;
        this.setupChevron();
        this.setupTheurgyButtons();
        this.createResourceRows();
        this.createProductionGrid();

        this.isExpanded = false;
    }

    setupChevron() {
        const chevron = document.createElement("div");
        chevron.classList.add("chevron");
        chevron.addEventListener("click", () => this.toggleView());

        this.resourcebox.appendChild(chevron);
    }

    setupTheurgyButtons() {
        const theurgyContainer = document.querySelector("#industry-theurgy");
        if (!theurgyContainer) return;

        const plantBtn = theurgyContainer.querySelector("#theurgy-plant");
        if (plantBtn) {
            plantBtn.addEventListener("pointerdown", (event) => {
                if (plantBtn.disabled) return;
                this.handleTheurgyClick("plant", event)
            });
        }

        const harvestBtn = theurgyContainer.querySelector("#theurgy-harvest");
        if (harvestBtn) {
            harvestBtn.addEventListener("pointerdown", (event) => {
                if (harvestBtn.disabled) return;
                this.handleTheurgyClick("harvest", event)
            });
        }

        this.theurgyButtons = {
            plant: plantBtn,
            harvest: harvestBtn
        };
    }

    createParticleExplosion(event) {
        const GRAVITY = 0.05;
        const DRAG = 0.97;
        const LIFESPAN = 70;

        const particles = [];

        const startX = event.clientX;
        const startY = event.clientY;
        const count = 5 + Math.floor(Math.random() * 3);

        const canvas = this.core.ui.canvas;
        const ctx = this.core.ui.canvas.getContext('2d');

        for (let i = 0; i < count; i++) {
            const size = 0.8 + Math.random();
            const angle = Math.random() * 2 * Math.PI;
            const speed = 1 + Math.random() * 1.5;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed * 0.6 - (0.8 + Math.random());

            particles.push({
                x: startX,
                y: startY,
                vx,
                vy,
                age: 0,
                size,
                lifespan: LIFESPAN
            });
        }

        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];

                p.vx *= DRAG;
                p.vy = p.vy * DRAG + GRAVITY;
                p.x += p.vx;
                p.y += p.vy;
                p.age++;

                const t = p.age / p.lifespan;
                const alpha = 1 - t;

                ctx.fillStyle = accent.replace('hsl', 'hsla').replace(')', `, ${alpha.toFixed(2)})`);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
                ctx.fill();

                if (p.age >= p.lifespan) {
                    particles.splice(i, 1);
                }
            }

            if (particles.length > 0) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }


    createRateIndicator(targetElement, isIncrease) {
        const indicator = document.createElement("span");
        indicator.className = "rate-indicator";
        indicator.innerHTML = isIncrease ? "↑" : "↓";
        indicator.style.color = isIncrease ? "var(--gainColor)" : "var(--drainColor)";
        
        const rect = targetElement.getBoundingClientRect();
        indicator.style.left = `${rect.right + 3}px`;
        indicator.style.top = `${rect.top + (isIncrease ? 3.5 : -3.5)}px`;
        
        document.body.appendChild(indicator);
        
        requestAnimationFrame(() => {
            indicator.style.opacity = "0";
            indicator.style.top = `${rect.top + (isIncrease ? -6 : 6)}px`;
        });
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 500);
    }

    addResourceFloater(resourceName, change) {
        const resourceRow = this.resourcebox._rows[resourceName];
        if (!resourceRow) return;

        const floatingText = document.createElement("div");
        floatingText.textContent = `${change.type === "gain" ? "+" : "-"}${change.amt}`;
        floatingText.className = "resourceFloater";
        floatingText.style.color = change.type === "gain" ? "var(--gainColor)" : "var(--drainColor)";

        const nameText = resourceRow.nameText;
        const textRect = nameText.getBoundingClientRect();
        const spanRect = resourceRow.nameSpan.getBoundingClientRect();

        const availableSpace = spanRect.right - textRect.right;
        const minDistance = availableSpace * 0.1;
        const randomX = textRect.right + minDistance + Math.random() * (availableSpace * 0.9)
        floatingText.style.left = `${randomX}px`;
        floatingText.style.top = `${textRect.top + 5}px`;

        document.body.appendChild(floatingText);

        requestAnimationFrame(() => {
            floatingText.style.opacity = "0";
            floatingText.style.transform = `translateY(-16px)`;
        });

        setTimeout(() => {
            if (floatingText.parentNode) {
                floatingText.parentNode.removeChild(floatingText);
            }
        }, 600);
    }

    handleTheurgyClick(theurgyType, event) {
        const changes = this.core.industry.performTheurgy(theurgyType);
        const button = this.theurgyButtons[theurgyType];
        button.classList.add("nudged");
        setTimeout(() => {
            button.classList.remove("nudged")
        }, 100);

        this.createParticleExplosion(event);

        changes.forEach(change => {
            this.addResourceFloater(change.res, change);
        })

        this.updateTheurgyButtonStates();
    }

    updateTheurgyButtonStates() {
        if (this.theurgyButtons.plant) {
            const canPlant = this.core.industry.canPerformTheurgy("plant");
            this.theurgyButtons.plant.disabled = !canPlant;
        }
        if (this.theurgyButtons.harvest) {
            const canHarvest = this.core.industry.canPerformTheurgy("harvest");
            this.theurgyButtons.harvest.disabled = !canHarvest;
        }
    }

    createResourceRows() {
        Object.entries(this.core.industry.resources).forEach(([resource, resObj]) => {
            if (!resObj.isDiscovered) return;
            this.appendResourceRow(resource);
        });
    }

    appendResourceRow(resource) {
        const row = document.createElement("div");
        row.classList.add("resource-row");

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("resource-name");

        const nameText = document.createElement("span");
        nameText.classList.add("resource-text");

        nameText.textContent = resource.replace(/\w\S*/g, txt =>
            txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
        );

        const rateSpan = document.createElement("span");
        rateSpan.classList.add("resource-rate");

        const valueSpan = document.createElement("span");
        valueSpan.classList.add("resource-value");
        valueSpan.textContent = "0";

        nameSpan.appendChild(nameText);
        row.appendChild(nameSpan);
        row.appendChild(rateSpan);
        row.appendChild(valueSpan);

        this.resourcebox.appendChild(row);
        this.resourcebox._rows[resource] = {nameSpan, nameText, valueSpan, rateSpan, row};
        this.previousRates[resource] = undefined;
    }

    createProductionGrid() {
        this.prodBox = this.root.querySelector('#industry-prod');
        this.buildingCards = {};

        const buildingsContainer = document.createElement('div');
        buildingsContainer.className = 'buildings-container';

        for (const [type, b] of Object.entries(this.core.industry.buildings)) {
            if (!this.core.industry.isBuildingUnlocked(type)) continue;
            const def = this.defs[type];
            const card = this.createBuildingCard(type, b, def);
            buildingsContainer.appendChild(card);
        }

        this.prodBox.appendChild(buildingsContainer);

        const footer = document.createElement('div');
        footer.className = 'prod-footer';

        const incrementBtn = document.createElement('button');
        incrementBtn.type = 'button';
        incrementBtn.className = 'prod-increment';
        incrementBtn.textContent = this.getIncrementLabel();
        incrementBtn.addEventListener('click', () => {
            if (this.core.industry?.cycleActionIncrement) {
                this.core.industry.cycleActionIncrement();
                this.updateIncrementControl();
            }
        });

        footer.appendChild(incrementBtn);
        this.prodBox.appendChild(footer);
        this.incrementBtn = incrementBtn;
    }

    getIncrementLabel() {
        if (!this.core.industry || typeof this.core.industry.getSelectedIncrement !== 'function') {
            return 'x1';
        }
        const inc = this.core.industry.getSelectedIncrement();
        return inc === 'max' ? 'xMax' : `x${inc}`;
    }

    updateIncrementControl() {
        if (this.incrementBtn) {
            this.incrementBtn.textContent = this.getIncrementLabel();
        }
    }

    isMultiIncrementActive() {
        if (!this.core.industry || typeof this.core.industry.getSelectedIncrement !== 'function') {
            return false;
        }
        const inc = this.core.industry.getSelectedIncrement();
        return inc === 'max' || inc > 1;
    }

    getActionPlanDetails(action, type) {
        if (!this.core.industry || typeof this.core.industry.getActionPlan !== 'function') {
            return {selected: 1, target: 1, actual: 0, limit: 0};
        }
        return this.core.industry.getActionPlan(action, type) || {selected: 1, target: 1, actual: 0, limit: 0};
    }

    areWorkersScaled() {
        if (!this.core.industry || typeof this.core.industry.getWorkerScalingFactor !== 'function') {
            return false;
        }
        const scale = this.core.industry.getWorkerScalingFactor();
        return scale < 1 && scale > 0;
    }

    hasBuildingStateChanged(data) {
        if (!data.buildings) return false;
        
        const currentState = {};
        for (const [type, b] of Object.entries(data.buildings)) {
            currentState[type] = {
                count: b.count || 0,
                workers: b.workers || 0
            };
        }
        
        const prevState = this.previousBuildingState;
        let changed = false;
        
        for (const [type, current] of Object.entries(currentState)) {
            const prev = prevState[type];
            if (!prev || prev.count !== current.count || prev.workers !== current.workers) {
                changed = true;
                break;
            }
        }
        
        for (const [type, prev] of Object.entries(prevState)) {
            if (!currentState[type]) {
                changed = true;
                break;
            }
        }
        
        this.previousBuildingState = currentState;
        return changed;
    }

    formatActionLabel(baseText, action, type) {
        if (!this.isMultiIncrementActive()) return baseText;
        const plan = this.getActionPlanDetails(action, type);
        const value = plan.selected === 'max' ? plan.actual : plan.target;
        if (value <= 1) return baseText;
        const symbol = 'x';
        return `${baseText} ${symbol}${value}`;
    }

    getPlanTarget(action, type) {
        const plan = this.getActionPlanDetails(action, type);
        return plan.target || 0;
    }

    getValueNumber(value) {
        if (value && typeof value.toNumber === 'function') return value.toNumber();
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    }

    getTotalAmount(value, count) {
        if (!count) return 0;
        const total = this.getValueNumber(value) * count;
        if (!Number.isFinite(total)) return 0;
        return Math.round(total * 100) / 100;
    }

    handleBuildAction(type, def) {
        const built = this.core.industry.buildBuilding(type);
        if (built && def && def.buildCost) {
            Object.entries(def.buildCost).forEach(([res, amt]) => {
                const total = this.getTotalAmount(amt, built);
                if (total > 0) {
                    this.addResourceFloater(res, {type: "drain", amt: total, res});
                }
            });
        }
    }

    handleSellAction(type, def) {
        const sold = this.core.industry.sellBuilding(type);
        if (sold && def && def.sellReward) {
            Object.entries(def.sellReward).forEach(([res, amt]) => {
                const total = this.getTotalAmount(amt, sold);
                if (total > 0) {
                    this.addResourceFloater(res, {type: "gain", amt: total, res});
                }
            });
        }
    }

    createBuildingCard(type, building, def) {
        const row = document.createElement('div');
        row.className = 'building-row';

        const mainBtn = document.createElement('button');
        mainBtn.className = 'building-main-btn';
        mainBtn.style.position = 'relative';
        mainBtn.innerHTML = `
            <div class="build-progress-fill"></div>
            <span class="building-title">${def ? def.name : type} <span class="building-count">(${building.count})</span></span>
        `;
        mainBtn.onclick = () => this.handleBuildAction(type, def);

        const workerBtn = document.createElement('button');
        workerBtn.className = 'building-worker-btn';
        const workerCount = building.workers || 0;
        workerBtn.innerHTML = `
            <span class="worker-btn-count">${workerCount}</span>
        `;
        const initialHirePlan = this.getActionPlanDetails('hire', type);
        workerBtn.disabled = initialHirePlan.actual === 0;
        
        workerBtn.onclick = (e) => {
            e.stopPropagation();
            this.core.industry.assignWorkerToBuilding(type);
        };

        // Chevron button
        const chevronBtn = document.createElement('button');
        chevronBtn.className = 'building-chevron-btn';
        chevronBtn.innerHTML = '<span class="chevron-icon">&#x25BC;</span>';

        const dropdown = document.createElement('div');
        dropdown.className = 'building-dropdown';

        const buildingSection = this.getBuildingSection(type, def, building);
        const workersSection = this.getWorkersSection(type, def, building);
        
        dropdown.innerHTML = `
            <div class="dropdown-content">
                ${buildingSection}
                ${workersSection}
            </div>
        `;

        chevronBtn.onclick = () => {
            building.dropped = !building.dropped;
            if (building.dropped) {
                dropdown.classList.add('dropped');
            } else {
                dropdown.classList.remove('dropped');
            }
        }

        const container = document.createElement('div');
        container.className = 'building-container';

        row.appendChild(mainBtn);
        row.appendChild(workerBtn);
        row.appendChild(chevronBtn);

        // Container for row + dropdown
        container.appendChild(row);
        container.appendChild(dropdown);

        const addBuildingBtn = dropdown.querySelector('.dropdown-add-building-btn');
        if (addBuildingBtn) {
            addBuildingBtn.onclick = () => this.handleBuildAction(type, def);
        }
        
        const sellBtn = dropdown.querySelector('.dropdown-sell-btn');
        if (sellBtn) {
            sellBtn.onclick = () => this.handleSellAction(type, def);
        }

        const addWorkerBtn = dropdown.querySelector('.dropdown-add-worker-btn');
        if (addWorkerBtn) {
            addWorkerBtn.onclick = () => {
                this.core.industry.assignWorkerToBuilding(type);
            };
        }

        const removeWorkerBtn = dropdown.querySelector('.dropdown-remove-worker-btn');
        if (removeWorkerBtn) {
            removeWorkerBtn.onclick = () => {
                this.core.industry.unassignWorkerFromBuilding(type);
            };
        }

        this.buildingCards[type] = {
            container,
            row,
            mainBtn,
            workerBtn,
            chevronBtn,
            dropdown,
            countSpan: mainBtn.querySelector('.building-count'),
            workerBtnCount: workerBtn.querySelector('.worker-btn-count'),
            addBuildingBtn: dropdown.querySelector('.dropdown-add-building-btn'),
            sellBtn: dropdown.querySelector('.dropdown-sell-btn'),
            addWorkerBtn: dropdown.querySelector('.dropdown-add-worker-btn'),
            removeWorkerBtn: dropdown.querySelector('.dropdown-remove-worker-btn')
        };

        return container;
    }

    getBuildingSection(type, def, b) {
        const canBuild = this.canBuildBuilding(type, def);
        const canSell = b.count > 0;
        const aggregateEffects = this.getAggregateBuildingEffects(type, def);
        const timeToNext = this.getTimeUntilNextBuilding(type, def);
        
        return `
            <div class="dropdown-section dropdown-building">
                <div class="dropdown-section-header">
                    <span>BUILDING${aggregateEffects ? ` (${aggregateEffects})` : ''}</span>
                    ${timeToNext ? `<span class="header-time">${timeToNext}</span>` : ''}
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-building-btn" ${!canBuild ? 'disabled' : ''} style="position: relative;">
                                <div class="build-progress-fill"></div>
                                Build
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="dropdown-sell-btn" ${!canSell ? 'disabled' : ''}>Demolish</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getWorkersSection(type, def, b) {
        const workerCount = b.workers || 0;
        const hirePlan = this.getActionPlanDetails('hire', type);
        const furloughPlan = this.getActionPlanDetails('furlough', type);
        const canAdd = hirePlan.actual > 0;
        const canRemove = furloughPlan.actual > 0;
        const onStrike = this.core.industry.workersOnStrike;
        const isScaled = this.areWorkersScaled();
        const aggregateWorkerEffects = this.getAggregateWorkerEffects(type, def);
        
        return `
            <div class="dropdown-section dropdown-workers">
                <div class="dropdown-section-header">
                    <span>WORKERS${aggregateWorkerEffects ? ` (${aggregateWorkerEffects})` : ''}</span>
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-worker-btn" ${!canAdd ? 'disabled' : ''}>
                                Hire
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="dropdown-remove-worker-btn" ${!canRemove ? 'disabled' : ''}>Furlough</button>
                        </div>
                    </div>
                    ${onStrike ? `
                    <div class="worker-strike">⚠ Workers on strike (insufficient food)</div>
                    ` : ''}
                    ${isScaled && !onStrike ? `
                    <div class="worker-limited">⚠ Worker output limited by input</div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    canBuildBuilding(type, def) {
        if (this.core.industry && typeof this.core.industry.getActionPlan === 'function') {
            return this.core.industry.getActionPlan('build', type).actual > 0;
        }
        if (!def || !def.buildCost) return true;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            if (!this.core.industry.resources[res] || 
                this.core.industry.resources[res].value.lt(cost)) {
                return false;
            }
        }
        return true;
    }

    getBuildProgress(type, def) {
        if (!def || !def.buildCost) return 1;
        const target = this.getPlanTarget('build', type);
        if (target <= 0) return 0;
        
        let minProgress = 1;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            const resource = this.core.industry.resources[res];
            if (!resource) return 0;
            const current = resource.value.toNumber();
            const requirement = this.getValueNumber(cost) * target;
            if (requirement <= 0) continue;
            const progress = Math.min(1, Math.max(0, current / requirement));
            
            if (progress < minProgress) {
                minProgress = progress;
            }
        }
        return minProgress;
    }

    getBuildingButtonDetails(type) {
        const result = this.core.industry.getBuildEffects(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails('build', type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const costs = [];
        if (result.costs) {
            result.costs.forEach(c => {
                costs.push({res: c.res, amt: c.amt * multiplier});
            });
        }
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val) * multiplier, type: val > 0 ? 'gain' : 'drain'});
        }
        
        return {costs, effects};
    }

    getDemolishButtonDetails(type) {
        const result = this.core.industry.getDemolishEffects(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails('sell', type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const rewards = [];
        if (result.rewards) {
            result.rewards.forEach(r => {
                rewards.push({res: r.res, amt: r.amt * multiplier});
            });
        }
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val) * multiplier, type: val > 0 ? 'gain' : 'drain'});
        }
        
        return {rewards, effects};
    }

    getFurloughButtonDetails(type) {
        const result = this.core.industry.getFurloughWorkerEffects(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails('furlough', type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val) * multiplier, type: val > 0 ? 'gain' : 'drain'});
        }
        
        return {effects};
    }

    renderButtonInfoBox(details) {
        if (!details) return '';
        
        const itemMap = new Map();
        
        if (details.costs) {
            details.costs.forEach(c => {
                if (c.amt !== undefined) {
                    const key = `cost_${c.res}_amt`;
                    itemMap.set(key, (itemMap.get(key) || 0) + c.amt);
                } else if (c.val !== undefined && c.res) {
                    const key = `cost_${c.res}_val`;
                    itemMap.set(key, (itemMap.get(key) || 0) + c.val);
                }
            });
        }
        
        if (details.rewards) {
            details.rewards.forEach(r => {
                const key = `reward_${r.res}_amt`;
                itemMap.set(key, (itemMap.get(key) || 0) + r.amt);
            });
        }
        
        if (details.effects) {
            details.effects.forEach(e => {
                const key = `effect_${e.res}_${e.type}`;
                itemMap.set(key, (itemMap.get(key) || 0) + e.val);
            });
        }
        
        const negativeItems = [];
        const positiveItems = [];
        
        for (const [key, total] of itemMap.entries()) {
            const parts = key.split('_');
            if (key.startsWith('cost_')) {
                if (parts[2] === 'amt') {
                    negativeItems.push(`<span class="info-cost">-${total} ${parts[1]}</span>`);
                } else {
                    negativeItems.push(`<span class="info-cost">-${total.toFixed(2)} ${parts[1]}/s</span>`);
                }
            } else if (key.startsWith('reward_')) {
                positiveItems.push(`<span class="info-effect effect-gain">+${total} ${parts[1]}</span>`);
            } else if (key.startsWith('effect_')) {
                if (parts[2] === 'drain') {
                    negativeItems.push(`<span class="info-effect effect-drain">-${total.toFixed(2)} ${parts[1]}/s</span>`);
                } else {
                    positiveItems.push(`<span class="info-effect effect-gain">+${total.toFixed(2)} ${parts[1]}/s</span>`);
                }
            }
        }
        
        const allItems = [...negativeItems, ...positiveItems];
        if (allItems.length === 0) return '';
        
        return allItems.join('');
    }

    updateButtonInfoBox(buttonElement, details) {
        if (!buttonElement) return;
        
        const buttonWithInfo = buttonElement.closest('.button-with-info');
        if (!buttonWithInfo) return;
        
        let infoBox = buttonWithInfo.querySelector('.button-info-box');
        const content = this.renderButtonInfoBox(details);
        
        if (content) {
            if (!infoBox) {
                infoBox = document.createElement('div');
                infoBox.className = 'button-info-box';
                buttonWithInfo.appendChild(infoBox);
            }
            infoBox.innerHTML = content;
        } else if (infoBox) {
            infoBox.remove();
        }
    }

    updateBuildButton(card, type, def) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-add-building-btn');
        if (!button) return;
        
        const textNodeType = (typeof Node !== 'undefined' && Node.TEXT_NODE) || 3;
        Array.from(button.childNodes).forEach(node => {
            if (node.nodeType === textNodeType && node.textContent.trim().length) {
                node.remove();
            }
        });
        let progressFill = button.querySelector('.build-progress-fill');
        if (!progressFill) {
            progressFill = document.createElement('div');
            progressFill.className = 'build-progress-fill';
            button.prepend(progressFill);
        }
        let labelSpan = button.querySelector('.build-btn-label');
        if (!labelSpan) {
            labelSpan = document.createElement('span');
            labelSpan.className = 'build-btn-label';
            labelSpan.style.position = 'relative';
            labelSpan.style.zIndex = '1';
            button.appendChild(labelSpan);
        }
        labelSpan.textContent = this.formatActionLabel('Build', 'build', type);

        const details = this.getBuildingButtonDetails(type);
        this.updateButtonInfoBox(button, details);
        
        if (progressFill) {
            const progress = this.getBuildProgress(type, def);
            const newWidth = progress * 100;
            const prevWidth = parseFloat(progressFill.dataset.prevWidth) || 0;
            
            if (newWidth < prevWidth) {
                progressFill.style.transition = 'none';
                progressFill.style.width = `${newWidth}%`;
                requestAnimationFrame(() => {
                    progressFill.style.transition = '';
                });
            } else {
                progressFill.style.width = `${newWidth}%`;
            }
            
            if (progress <= 0 || progress >= 1) {
                progressFill.style.borderRight = 'none';
            } else {
                progressFill.style.borderRight = '1px solid var(--accent)';
            }
            
            progressFill.dataset.prevWidth = newWidth.toString();
        }
    }

    updateMainButton(card, type, def) {
        const button = card.mainBtn;
        if (!button) return;
        
        const titleSpan = button.querySelector('.building-title');
        if (titleSpan) {
            let incrementSpan = titleSpan.querySelector('.building-increment');
            const buildPlan = this.getActionPlanDetails('build', type);
            
            if (this.isMultiIncrementActive()) {
                const value = buildPlan.selected === 'max' ? buildPlan.actual : buildPlan.target;
                if (value > 1) {
                    if (!incrementSpan) {
                        incrementSpan = document.createElement('span');
                        incrementSpan.className = 'building-increment';
                        titleSpan.insertBefore(incrementSpan, titleSpan.firstChild);
                    }
                    incrementSpan.textContent = ` x${value} `;
                } else if (incrementSpan) {
                    incrementSpan.remove();
                }
            } else if (incrementSpan) {
                incrementSpan.remove();
            }
        }
        
        const progressFill = button.querySelector('.build-progress-fill');
        if (progressFill) {
            const progress = this.getBuildProgress(type, def);
            const newWidth = progress * 100;
            const prevWidth = parseFloat(progressFill.dataset.prevWidth) || 0;
            
            if (newWidth < prevWidth) {
                progressFill.style.transition = 'none';
                progressFill.style.width = `${newWidth}%`;
                requestAnimationFrame(() => {
                    progressFill.style.transition = '';
                });
            } else {
                progressFill.style.width = `${newWidth}%`;
            }
            
            if (progress <= 0 || progress >= 1) {
                progressFill.style.borderRight = 'none';
            } else {
                progressFill.style.borderRight = '1px solid var(--accent)';
            }
            
            progressFill.dataset.prevWidth = newWidth.toString();
        }
    }

    updateDemolishButton(card, type, def, b) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-sell-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Demolish', 'sell', type);
        const details = this.getDemolishButtonDetails(type);
        const sellPlan = this.getActionPlanDetails('sell', type);
        this.updateButtonInfoBox(button, sellPlan.actual > 0 ? details : null);
    }

    updateHireButton(card, type, def) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-add-worker-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Hire', 'hire', type);
        const details = this.getWorkerButtonDetails(type, def);
        this.updateButtonInfoBox(button, details);
    }

    updateFurloughButton(card, type, def, b) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-remove-worker-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Furlough', 'furlough', type);
        const details = this.getFurloughButtonDetails(type, def);
        const furloughPlan = this.getActionPlanDetails('furlough', type);
        this.updateButtonInfoBox(button, furloughPlan.actual > 0 ? details : null);
    }

    getAggregateBuildingEffects(type, def) {
        if (!def || !def.effects) return null;
        
        const b = this.core.industry.buildings[type];
        if (!b || b.count === 0) return null;
        
        const negativeItems = [];
        const positiveItems = [];
        for (const [res, eff] of Object.entries(def.effects)) {
            if (!eff.base) continue;
            
            if (eff.base.gain) {
                const gain = eff.base.gain.toNumber ? eff.base.gain.toNumber() : eff.base.gain;
                const total = b.count * gain;
                positiveItems.push(`<span style="color: var(--gainColor)">+${total.toFixed(2)} ${res}/s</span>`);
            }
            if (eff.base.drain) {
                const drain = eff.base.drain.toNumber ? eff.base.drain.toNumber() : eff.base.drain;
                const total = b.count * drain;
                negativeItems.push(`<span style="color: var(--drainColor)">-${total.toFixed(2)} ${res}/s</span>`);
            }
        }
        
        const allItems = [...negativeItems, ...positiveItems];
        return allItems.length > 0 ? allItems.join(',&nbsp;') : null;
    }

    getWorkerButtonDetails(type) {
        const result = this.core.industry.getHireWorkerEffects(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails('hire', type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const costs = [];
        const effects = [];
        
        for (const [res, val] of Object.entries(result.effects)) {
            if (val < 0) {
                costs.push({res, val: Math.abs(val) * multiplier, type: 'drain'});
            } else {
                effects.push({res, val: val * multiplier, type: 'gain'});
            }
        }
        
        return {costs, effects};
    }

    getAggregateWorkerEffects(type, def) {
        if (!def || !def.effects) return null;
        
        const b = this.core.industry.buildings[type];
        if (!b || !b.workers || b.workers === 0) return null;
            
        const netEffects = {};
        for (const [res, eff] of Object.entries(def.effects)) {
            if (!eff.worker) continue;
            
            if (!netEffects[res]) {
                netEffects[res] = 0;
            }
            
            if (eff.worker.gain) {
                const gain = eff.worker.gain.toNumber ? eff.worker.gain.toNumber() : eff.worker.gain;
                netEffects[res] += b.workers * gain;
            }
            if (eff.worker.drain) {
                const drain = eff.worker.drain.toNumber ? eff.worker.drain.toNumber() : eff.worker.drain;
                netEffects[res] -= b.workers * drain;
            }
        }
        
        const negativeItems = [];
        const positiveItems = [];
        for (const [res, net] of Object.entries(netEffects)) {
            if (net !== 0) {
                const isGain = net > 0;
                const sign = isGain ? '+' : '';
                // language=HTML
                const item = `<span style="color: var(--${isGain ? 'gain' : 'drain'}Color)">${sign}${net.toFixed(2)} ${res}/s</span>`;
                if (isGain) {
                    positiveItems.push(item);
                } else {
                    negativeItems.push(item);
                }
            }
        }
        
        const allItems = [...negativeItems, ...positiveItems];
        return allItems.length > 0 ? allItems.join(',&nbsp;') : null;
    }

    getTimeUntilNextBuilding(type, def) {
        if (!def || !def.buildCost) return null;
        
        const target = this.getPlanTarget('build', type);
        if (target <= 0) return null;
        
        const resources = this.core.industry.resources;
        let maxTime = 0;
        
        for (const [res, cost] of Object.entries(def.buildCost)) {
            if (!resources[res]) return null;
            
            const current = resources[res].value.toNumber();
            const requirement = this.getValueNumber(cost) * target;
            const needed = requirement - current;
            
            if (needed <= 0) return null;
            
            const rate = resources[res].netGrowthRate.toNumber();
            if (rate <= 0) return null;
            
            const time = needed / rate;
            if (time > maxTime) maxTime = time;
        }
        
        if (maxTime === 0 || !isFinite(maxTime)) return null;
        
        return this.formatTime(maxTime);
    }

    formatTime(seconds) {
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
        return `${Math.ceil(seconds / 86400)}d`;
    }

    toggleView() {
        this.isExpanded = !this.isExpanded;
        if (this.core.industry.configs) {
            this.core.industry.configs.resourceBoxExpanded = this.isExpanded;
        }
        this.resourcebox.classList.add("animatingWidth");
        if (this.isExpanded) {
            this.resourcebox.classList.add("expanded");
        } else {
            this.resourcebox.classList.remove("expanded");
        }
        setTimeout(() => {
            this.resourcebox.classList.remove("animatingWidth");
        }, 320); // based on CSS transition duration
        if (this.isExpanded && this.core.industry) {
            this.render(this.core.industry.getStatus());
        }
    }

    renderResources(data) {
        function formatValueParts(val) {
            let num = val.toNumber();
            if (num < 1) {
                const decPart = num.toFixed(2).slice(1);
                return {int: '0', dec: decPart};
            }
            if (num < 1000) {
                const intPart = Math.floor(num).toString();
                const decPart = (num % 1).toFixed(2).slice(1);
                return {int: intPart, dec: decPart};
            }
            if (num < 1e6) return {int: (num / 1e3).toFixed(2) + 'k', dec: ''};
            if (num < 1e9) return {int: (num / 1e6).toFixed(2) + 'M', dec: ''};
            return {int: num.toExponential(2), dec: ''};
        }

        function formatRate(val) {
            let num = val.toNumber();
            if (Math.abs(num) < 1000) return num.toFixed(2);
            if (Math.abs(num) < 1e6) return (num / 1e3).toFixed(2).replace(/\.00$/, '') + 'k';
            if (Math.abs(num) < 1e9) return (num / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
            return num.toExponential(2);
        }

        const buildingStateChanged = this.hasBuildingStateChanged(data);

        Object.entries(data.resources).forEach(([k, v]) => {
            if (this.resourcebox._rows[k]) {
                const {valueSpan, rateSpan} = this.resourcebox._rows[k];
                const parts = formatValueParts(v.value);
                if (this.isExpanded || window.matchMedia('(width <= 950px)').matches) {
                    valueSpan.innerHTML = `${parts.int}<span style="opacity: 0.5;font-size:0.8em;">${parts.dec}</span>`;
                } else {
                    valueSpan.textContent = parts.int;
                }
                if (v.rate !== undefined && (this.isExpanded || window.matchMedia('(width <= 950px)').matches)) {
                    let rateNum = v.rate.toNumber();
                    const prevRate = this.previousRates[k];
                    
                    if (prevRate !== undefined && Math.abs(rateNum - prevRate) > 0.1 && buildingStateChanged) {
                        const isIncrease = rateNum > prevRate;
                        this.createRateIndicator(rateSpan, isIncrease);
                    }
                    
                    rateSpan.textContent = (rateNum >= 0 ? '+' : '') + formatRate(v.rate);
                    rateSpan.classList.toggle('positive', rateNum > 0);
                    rateSpan.classList.toggle('negative', rateNum < 0);
                    
                    this.previousRates[k] = rateNum;
                } else if (v.rate !== undefined) {
                    this.previousRates[k] = v.rate.toNumber();
                }

                if (v.rate !== undefined) {
                    let rateNum = v.rate.toNumber();
                    const {nameSpan} = this.resourcebox._rows[k];

                    if (rateNum > 0) {
                        nameSpan.classList.remove('draining');
                        nameSpan.classList.add('gaining');
                    } else if (rateNum < 0) {
                        nameSpan.classList.remove('gaining');
                        nameSpan.classList.add('draining');
                    } else {
                        nameSpan.classList.remove('gaining', 'draining');
                    }
                }
            } else {
                this.appendResourceRow(k);
            }
        });
    }

    render(data) {
        this.renderResources(data);
        this.updateTheurgyButtonStates();
        this.updateIncrementControl();
        this.updateBuildingCards(data);
    }

    updateBuildingCards(data) {
        if (!this.buildingCards || !data.buildings) return;

        const buildingsContainer = this.prodBox.querySelector('.buildings-container');
        if (!buildingsContainer) return;

        for (const [type, b] of Object.entries(data.buildings)) {
            const def = this.defs[type];
            const isUnlocked = this.core.industry.isBuildingUnlocked(type);
            
            if (isUnlocked && !this.buildingCards[type]) {
                const card = this.createBuildingCard(type, b, def);
                buildingsContainer.appendChild(card);
            }
            
            if (!isUnlocked && this.buildingCards[type]) {
                const card = this.buildingCards[type];
                if (card.container && card.container.parentNode) {
                    card.container.parentNode.removeChild(card.container);
                }
                delete this.buildingCards[type];
                continue;
            }
            
            if (this.buildingCards[type]) {
                const card = this.buildingCards[type];
                card.countSpan.textContent = `(${b.count})`;
                
                if (card.dropdown) {
                    if (b.dropped === true) {
                        card.dropdown.classList.add('dropped');
                    } else {
                        card.dropdown.classList.remove('dropped');
                    }
                }
                
                const buildPlan = this.getActionPlanDetails('build', type);
                const sellPlan = this.getActionPlanDetails('sell', type);
                const hirePlan = this.getActionPlanDetails('hire', type);
                const furloughPlan = this.getActionPlanDetails('furlough', type);

                if (card.workerBtn) {
                    const workerCount = b.workers || 0;
                    const onStrike = this.core.industry.workersOnStrike;
                    const isScaled = this.areWorkersScaled();
                    
                    if (card.workerBtnCount) {
                        card.workerBtnCount.textContent = workerCount;
                        if (onStrike && workerCount > 0) {
                            card.workerBtnCount.classList.add('on-strike');
                            card.workerBtnCount.classList.remove('limited');
                        } else if (isScaled && workerCount > 0) {
                            card.workerBtnCount.classList.add('limited');
                            card.workerBtnCount.classList.remove('on-strike');
                        } else {
                            card.workerBtnCount.classList.remove('on-strike', 'limited');
                        }
                    }
                    card.workerBtn.disabled = hirePlan.actual === 0;
                }
                
                const canBuild = buildPlan.actual > 0;
                if (card.addBuildingBtn) {
                    card.addBuildingBtn.disabled = !canBuild;
                }
                
                if (card.mainBtn && def && def.buildCost) {
                    card.mainBtn.disabled = !canBuild;
                }
                
                if (card.sellBtn) {
                    card.sellBtn.disabled = sellPlan.actual === 0;
                }
                
                if (card.addWorkerBtn) {
                    card.addWorkerBtn.disabled = hirePlan.actual === 0;
                }
                
                if (card.removeWorkerBtn) {
                    card.removeWorkerBtn.disabled = furloughPlan.actual === 0;
                }
                
                this.updateBuildButton(card, type, def);
                this.updateMainButton(card, type, def);
                this.updateDemolishButton(card, type, def, b);
                this.updateHireButton(card, type, def, b);
                this.updateFurloughButton(card, type, def, b);
                
                const buildingHeader = card.dropdown?.querySelector('.dropdown-building .dropdown-section-header');
                if (buildingHeader) {
                    const headerSpan = buildingHeader.querySelector('span:first-child');
                    if (headerSpan) {
                        const aggregateEffects = this.getAggregateBuildingEffects(type, def);
                        headerSpan.innerHTML = `BUILDING${aggregateEffects ? ` (<span class="header-effects">${aggregateEffects}</span>)` : ''}`;
                    }
                    
                    const timeToNext = this.getTimeUntilNextBuilding(type, def);
                    let timeSpan = buildingHeader.querySelector('.header-time');
                    if (timeToNext) {
                        if (!timeSpan) {
                            timeSpan = document.createElement('span');
                            timeSpan.className = 'header-time';
                            buildingHeader.appendChild(timeSpan);
                        }
                        timeSpan.textContent = timeToNext;
                    } else if (timeSpan) {
                        timeSpan.remove();
                    }
                }
                
                const workerHeader = card.dropdown?.querySelector('.dropdown-workers .dropdown-section-header span');
                if (workerHeader) {
                    const aggregateWorkerEffects = this.getAggregateWorkerEffects(type, def);
                    workerHeader.innerHTML = `WORKERS${aggregateWorkerEffects ? ` (<span class="header-effects">${aggregateWorkerEffects}</span>)` : ''}`;
                }
                
                const onStrike = this.core.industry.workersOnStrike;
                const isScaled = this.areWorkersScaled();
                const workersSection = card.dropdown?.querySelector('.dropdown-workers');
                if (workersSection) {
                    const sectionBody = workersSection.querySelector('.dropdown-section-body');
                    if (sectionBody) {
                        const strikeDiv = sectionBody.querySelector('.worker-strike');
                        const limitedDiv = sectionBody.querySelector('.worker-limited');
                        
                        if (onStrike) {
                            if (!strikeDiv) {
                                const strikeElement = document.createElement('div');
                                strikeElement.className = 'worker-strike';
                                strikeElement.textContent = '⚠ Workers on strike (insufficient food)';
                                sectionBody.appendChild(strikeElement);
                            }
                            if (limitedDiv) limitedDiv.remove();
                        } else if (isScaled) {
                            if (!limitedDiv) {
                                const limitedElement = document.createElement('div');
                                limitedElement.className = 'worker-limited';
                                limitedElement.textContent = '⚠ Worker output limited by input';
                                sectionBody.appendChild(limitedElement);
                            }
                            if (strikeDiv) strikeDiv.remove();
                        } else {
                            if (strikeDiv) strikeDiv.remove();
                            if (limitedDiv) limitedDiv.remove();
                        }
                    }
                }
                
            }
        }
    }


    updateVisibility(loc, panel) {
        this.core.industry.updateLoops();
        if (loc === "center") {
            if (panel === "industry") {
                this.root.classList.add("shown");
            } else {
                this.root.classList.remove("shown");
            }
        }
    }
}
