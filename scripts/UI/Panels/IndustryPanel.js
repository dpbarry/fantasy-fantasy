export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.defs = this.core.industry.constructor.BUILDING_DEFS;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
        this.previousRates = {};
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
            const def = this.defs[type];
            const card = this.createBuildingCard(type, b, def);
            buildingsContainer.appendChild(card);
        }

        this.prodBox.appendChild(buildingsContainer);
    }

    handleBuildAction(type, def) {
        if (def && def.buildCost) {
            const success = this.core.industry.buildBuilding(type);
            if (success) {
                Object.entries(def.buildCost).forEach(([res, amt]) => {
                    this.addResourceFloater(res, {type: "drain", amt: amt.toNumber ? amt.toNumber() : amt, res});
                });
            }
        } else {
            this.core.industry.buildBuilding(type);
        }
    }

    handleSellAction(type, def) {
        if (def && def.sellReward) {
            const success = this.core.industry.sellBuilding(type);
            if (success) {
                Object.entries(def.sellReward).forEach(([res, amt]) => {
                    this.addResourceFloater(res, {type: "gain", amt: amt.toNumber ? amt.toNumber() : amt, res});
                });
            }
        } else {
            if (this.core.industry.sellBuilding(type)) {
                this.core.industry.broadcast();
            }
        }
    }

    createBuildingCard(type, building, def) {
        const row = document.createElement('div');
        row.className = 'building-row';

        const mainBtn = document.createElement('button');
        mainBtn.className = 'building-main-btn';
        mainBtn.innerHTML = `<span class="building-title">${def ? def.name : type} <span class="building-count">(${building.count})</span></span>`;
        mainBtn.onclick = () => this.handleBuildAction(type, def);

        const workerBtn = document.createElement('button');
        workerBtn.className = 'building-worker-btn';
        const workerCount = building.workers || 0;
        const canAdd = this.core.industry.unassignedWorkers > 0;
        workerBtn.innerHTML = `
            <span class="worker-btn-count">${workerCount}</span>
        `;
        workerBtn.disabled = !canAdd;
        
        workerBtn.onclick = (e) => {
            e.stopPropagation();
            if (canAdd && this.core.industry.assignWorkerToBuilding(type)) {
                this.core.industry.broadcast();
            }
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
                if (this.core.industry.assignWorkerToBuilding(type)) {
                    this.core.industry.broadcast();
                }
            };
        }

        const removeWorkerBtn = dropdown.querySelector('.dropdown-remove-worker-btn');
        if (removeWorkerBtn) {
            removeWorkerBtn.onclick = () => {
                if (this.core.industry.unassignWorkerFromBuilding(type)) {
                    this.core.industry.broadcast();
                }
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
        const canBuild = def && def.buildCost && this.canBuildBuilding(type, def);
        const canSell = b.count > 0;
        const aggregateEffects = this.getAggregateBuildingEffects(type, def);
        
        return `
            <div class="dropdown-section dropdown-building">
                <div class="dropdown-section-header">
                    <span>BUILDING${aggregateEffects ? ` (${aggregateEffects})` : ''}</span>
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-building-btn" ${!canBuild ? 'disabled' : ''}>
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
        const canAdd = this.core.industry.unassignedWorkers > 0 && b.count > 0;
        const canRemove = workerCount > 0;
        const onStrike = this.core.industry.workersOnStrike;
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
                </div>
            </div>
        `;
    }

    canBuildBuilding(type, def) {
        if (!def || !def.buildCost) return true;
        for (const [res, cost] of Object.entries(def.buildCost)) {
            if (!this.core.industry.resources[res] || 
                this.core.industry.resources[res].value.lt(cost)) {
                return false;
            }
        }
        return true;
    }

    getBuildingButtonDetails(type) {
        const result = this.core.industry.getBuildEffects(type);
        if (!result) return null;
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val), type: val > 0 ? 'gain' : 'drain'});
        }
        
        return {costs: result.costs, effects};
    }

    getDemolishButtonDetails(type) {
        const result = this.core.industry.getDemolishEffects(type);
        if (!result) return null;
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val), type: val > 0 ? 'gain' : 'drain'});
        }
        
        return {rewards: result.rewards, effects};
    }

    getFurloughButtonDetails(type) {
        const result = this.core.industry.getFurloughWorkerEffects(type);
        if (!result) return null;
        
        const effects = [];
        for (const [res, val] of Object.entries(result.effects)) {
            effects.push({res, val: Math.abs(val), type: val > 0 ? 'gain' : 'drain'});
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

    updateBuildButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-add-building-btn');
        if (!button) return;
        
        button.textContent = 'Build';
        const details = this.getBuildingButtonDetails(type);
        this.updateButtonInfoBox(button, details);
    }

    updateDemolishButton(card, type, def, b) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-sell-btn');
        if (!button) return;
        
        button.textContent = 'Demolish';
        const details = this.getDemolishButtonDetails(type);
        const canSell = b.count > 0;
        this.updateButtonInfoBox(button, canSell ? details : null);
    }

    updateHireButton(card, type, def) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-add-worker-btn');
        if (!button) return;
        
        button.textContent = 'Hire';
        const details = this.getWorkerButtonDetails(type, def);
        this.updateButtonInfoBox(button, details);
    }

    updateFurloughButton(card, type, def, b) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-remove-worker-btn');
        if (!button) return;
        
        button.textContent = 'Furlough';
        const details = this.getFurloughButtonDetails(type, def);
        const canRemove = (b.workers || 0) > 0;
        this.updateButtonInfoBox(button, canRemove ? details : null);
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
        
        const costs = [];
        const effects = [];
        
        for (const [res, val] of Object.entries(result.effects)) {
            if (val < 0) {
                costs.push({res, val: Math.abs(val), type: 'drain'});
            } else {
                effects.push({res, val: val, type: 'gain'});
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
        
        const resources = this.core.industry.resources;
        let maxTime = 0;
        
        for (const [res, cost] of Object.entries(def.buildCost)) {
            if (!resources[res]) return null;
            
            const current = resources[res].value;
            const needed = cost - current.toNumber();
            
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
                    
                    if (prevRate !== undefined && Math.abs(rateNum - prevRate) > 0.001 && this.isExpanded) {
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
        this.updateWorkerTotals(data);
        this.updateBuildingCards(data);
    }

    updateWorkerTotals(data) {
        const totalWorkers = data.resources.workers ? Math.floor(data.resources.workers.value.toNumber()) : 0;
        const availableWorkers = this.core.industry.unassignedWorkers;

        const totalElement = this.prodBox.querySelector('#total-workers');
        const availableElement = this.prodBox.querySelector('#available-workers');

        if (totalElement) totalElement.textContent = `(${totalWorkers} total)`;
        if (availableElement) availableElement.textContent = availableWorkers;
    }

    updateBuildingCards(data) {
        if (!this.buildingCards || !data.buildings) return;

        for (const [type, b] of Object.entries(data.buildings)) {
            const def = this.defs[type];
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
                
                if (card.workerBtn) {
                    const workerCount = b.workers || 0;
                    const availableWorkers = this.core.industry.unassignedWorkers;
                    const canAddWorker = availableWorkers > 0;
                    const onStrike = this.core.industry.workersOnStrike;
                    
                    if (card.workerBtnCount) {
                        card.workerBtnCount.textContent = workerCount;
                        if (onStrike && workerCount > 0) {
                            card.workerBtnCount.classList.add('on-strike');
                        } else {
                            card.workerBtnCount.classList.remove('on-strike');
                        }
                    }
                    card.workerBtn.disabled = !canAddWorker;
                }
                
                const canBuild = def && def.buildCost && this.canBuildBuilding(type, def);
                if (card.addBuildingBtn) {
                    card.addBuildingBtn.disabled = !canBuild;
                }
                
                if (card.sellBtn) {
                    card.sellBtn.disabled = (b.count === 0);
                }
                
                const canAdd = this.core.industry.unassignedWorkers > 0 && b.count > 0;
                if (card.addWorkerBtn) {
                    card.addWorkerBtn.disabled = !canAdd;
                }
                
                if (card.removeWorkerBtn) {
                    card.removeWorkerBtn.disabled = (b.workers || 0) === 0;
                }
                
                this.updateBuildButton(card, type, def, b);
                this.updateDemolishButton(card, type, def, b);
                this.updateHireButton(card, type, def, b);
                this.updateFurloughButton(card, type, def, b);
                
                const buildingHeader = card.dropdown?.querySelector('.dropdown-building .dropdown-section-header span');
                if (buildingHeader) {
                    const aggregateEffects = this.getAggregateBuildingEffects(type, def);
                    buildingHeader.innerHTML = `BUILDING${aggregateEffects ? ` (<span class="header-effects">${aggregateEffects}</span>)` : ''}`;
                }
                
                const workerHeader = card.dropdown?.querySelector('.dropdown-workers .dropdown-section-header span');
                if (workerHeader) {
                    const aggregateWorkerEffects = this.getAggregateWorkerEffects(type, def);
                    workerHeader.innerHTML = `WORKERS${aggregateWorkerEffects ? ` (<span class="header-effects">${aggregateWorkerEffects}</span>)` : ''}`;
                }
                
                // Update strike indicator in dropdown
                const onStrike = this.core.industry.workersOnStrike;
                const workersSection = card.dropdown?.querySelector('.dropdown-workers');
                if (workersSection) {
                    const sectionBody = workersSection.querySelector('.dropdown-section-body');
                    if (sectionBody) {
                        const strikeDiv = sectionBody.querySelector('.worker-strike');
                        if (onStrike) {
                            if (!strikeDiv) {
                                const strikeElement = document.createElement('div');
                                strikeElement.className = 'worker-strike';
                                strikeElement.textContent = '⚠ Workers on strike (insufficient food)';
                                sectionBody.appendChild(strikeElement);
                            }
                        } else if (strikeDiv) {
                            strikeDiv.remove();
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
