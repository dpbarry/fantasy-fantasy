export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.defs = this.core.industry.constructor.BUILDING_DEFS;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
        this.previousRates = {};
        this.previousLimits = {};
        this.previousBuildingState = {};
        this.incrementBtn = null;
        this.setupChevron();
        this.setupTheurgyButtons();
        this.createResourceRows();
        this.createProductionGrid();

        this.isExpanded = false;
    }

    // ============================================================================
    // CORE RENDER METHODS
    // ============================================================================

    render(data) {
        this.renderResources(data);
        this.updateTheurgyButtonStates();
        this.updateIncrementControl();
        this.updateBuildingCards(data);
        this.updateFreeWorkers();
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
                const {valueSpan, rateSpan, row} = this.resourcebox._rows[k];
                const parts = formatValueParts(v.value);
                if (this.isExpanded || window.matchMedia('(width <= 950px)').matches) {
                    valueSpan.innerHTML = `${parts.int}<span style="opacity: 0.5;font-size:0.8em;">${parts.dec}</span>`;
                } else {
                    valueSpan.textContent = parts.int;
                }

                const cap = v.effectiveCap;
                if (cap !== undefined) {
                    const currentVal = v.value.toNumber();
                    const capVal = cap.toNumber();
                    const percent = Math.min(100, (currentVal / capVal) * 100);
                    row.style.setProperty('--cap-percent', `${percent}%`);
                    row.classList.add('has-cap');
                } else {
                    row.classList.remove('has-cap');
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
                } else if (v.rate !== undefined) {
                    this.previousRates[k] = v.rate.toNumber();
                }
            } else {
                this.appendResourceRow(k);
            }
        });
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
                card.container?.remove();
                delete this.buildingCards[type];
                continue;
            }
            
            if (this.buildingCards[type]) {
                const card = this.buildingCards[type];
                if (card.countSpan) {
                    card.countSpan.textContent = `(${b.count})`;
                }
                
                if (card.dropdown) {
                    card.dropdown.classList.toggle('dropped', b.dropped === true);
                }
                
                const buildPlan = this.getActionPlanDetails('build', type);
                const sellPlan = this.getActionPlanDetails('sell', type);
                const hirePlan = this.getActionPlanDetails('hire', type);
                const furloughPlan = this.getActionPlanDetails('furlough', type);

                if (card.workerBtn) {
                    const workerCount = b.workers || 0;
                    const maxWorkers = this.core.industry.getMaxWorkers(type);
                    const onStrike = this.core.industry.workersOnStrike;
                    const isScaled = this.areWorkersScaled();
                    const atLimit = workerCount >= maxWorkers && maxWorkers > 0;
                    
                    if (card.workerBtnCount) {
                        card.workerBtnCount.textContent = workerCount;
                        const classes = { 'on-strike': onStrike && workerCount > 0, 'limited': isScaled && workerCount > 0, 'at-limit': atLimit };
                        Object.entries(classes).forEach(([cls, active]) => 
                            card.workerBtnCount.classList.toggle(cls, active)
                        );
                    }
                    const canHire = hirePlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.workerBtn, canHire, 'hire-disabled', type);
                }
                
                const canBuild = buildPlan.actual > 0;
                if (card.addBuildingBtn) card.addBuildingBtn.disabled = !canBuild;
                if (card.mainBtn && def?.buildCost) card.mainBtn.disabled = !canBuild;
                
                if (card.sellBtn) {
                    const canSell = sellPlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.sellBtn, canSell, 'demolish-disabled', type);
                }
                
                if (card.addWorkerBtn) {
                    const canHire = hirePlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.addWorkerBtn, canHire, 'hire-disabled', type);
                }
                
                if (card.removeWorkerBtn) {
                    const canFurlough = furloughPlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.removeWorkerBtn, canFurlough, 'furlough-disabled', type);
                }
                
                this.updateBuildButton(card, type, def);
                this.updateMainButton(card, type, def);
                this.updateDemolishButton(card, type);
                this.updateHireButton(card, type);
                this.updateFurloughButton(card, type);
                
                const buildingHeader = card.dropdown?.querySelector('.dropdown-building .dropdown-section-header');
                if (buildingHeader) {
                    const headerSpan = buildingHeader.querySelector('span:first-child');
                    if (headerSpan) {
                        const aggregateEffects = this.getAggregateBuildingEffects(type);
                        const content = `BUILDING${aggregateEffects ? ` (<span class="header-effects">${aggregateEffects}</span>)` : ''}`;
                        this.updateHeaderSpanWithTooltip(headerSpan, !!aggregateEffects, 'building-effects', type, content);
                    }
                    
                    const timeToNext = this.getTimeUntilNextBuilding(type);
                    this.updateOrCreateTimeSpan(buildingHeader, timeToNext, 'time-to-next', type);
                }
                
                const workerHeader = card.dropdown?.querySelector('.dropdown-workers .dropdown-section-header');
                if (workerHeader) {
                    const headerSpan = workerHeader.querySelector('span:first-child');
                    if (headerSpan) {
                        const aggregateWorkerEffects = this.getAggregateWorkerEffects(type);
                        const content = `WORKERS${aggregateWorkerEffects ? ` (<span class="header-effects">${aggregateWorkerEffects}</span>)` : ''}`;
                        this.updateHeaderSpanWithTooltip(headerSpan, !!aggregateWorkerEffects, 'worker-effects', type, content);
                    }
                    
                    const maxWorkers = this.core.industry.getMaxWorkers(type);
                    const atLimit = (b.workers || 0) >= maxWorkers && maxWorkers > 0;
                    this.updateOrCreateLimitSpan(workerHeader, maxWorkers, atLimit, type);
                }
                
                const workersSection = card.dropdown?.querySelector('.dropdown-workers');
                if (workersSection) {
                    const sectionBody = workersSection.querySelector('.dropdown-section-body');
                    if (sectionBody) {
                        this.updateWorkerWarnings(sectionBody, type);
                    }
                }
                
            }
        }
    }

    updateFreeWorkers() {
        if (this.freeWorkersSpan) {
            const freeWorkers = this.core.industry.unassignedWorkers;
            this.freeWorkersSpan.textContent = `Free: ${Math.floor(freeWorkers).toFixed(0)}`;
        }
    }

    // ============================================================================
    // SETUP & INITIALIZATION
    // ============================================================================

    setupChevron() {
        const chevron = document.createElement("div");
        chevron.classList.add("chevron");
        chevron.addEventListener("click", () => this.toggleView());

        this.resourcebox.appendChild(chevron);
    }

    setupTheurgyButtons() {
        const theurgyContainer = document.querySelector("#industry-theurgy");
        if (!theurgyContainer) return;

        this.theurgyButtons = ['plant', 'harvest'].reduce((acc, type) => {
            const btn = theurgyContainer.querySelector(`#theurgy-${type}`);
            if (btn) {
                btn.classList.add('hastip');
                btn.dataset.tip = `theurgy-${type}`;
                btn.addEventListener("pointerdown", (event) => {
                    if (!btn.disabled) this.handleTheurgyClick(type, event);
                });
                acc[type] = btn;
            }
            return acc;
        }, {});
    }

    createResourceRows() {
        Object.entries(this.core.industry.resources)
            .filter(([, resObj]) => resObj.isDiscovered)
            .forEach(([resource]) => this.appendResourceRow(resource));
    }

    appendResourceRow(resource) {
        const row = document.createElement("div");
        row.classList.add("resource-row");

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("resource-name", "hastip");
        nameSpan.dataset.tip = "resource-name";
        nameSpan.dataset.resource = resource;

        const nameText = document.createElement("span");
        nameText.classList.add("resource-text");

        nameText.textContent = resource.replace(/\w\S*/g, txt => 
            txt[0].toUpperCase() + txt.slice(1).toLowerCase()
        );

        const rateSpan = document.createElement("span");
        rateSpan.classList.add("resource-rate", "hastip");
        rateSpan.dataset.tip = "resource-rate";
        rateSpan.dataset.resource = resource;

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

        const freeWorkersSpan = document.createElement('span');
        freeWorkersSpan.className = 'prod-free-workers';
        freeWorkersSpan.textContent = 'Free: 0';
        footer.appendChild(freeWorkersSpan);
        this.freeWorkersSpan = freeWorkersSpan;

        const incrementBtn = document.createElement('button');
        incrementBtn.type = 'button';
        incrementBtn.className = 'prod-increment hastip';
        incrementBtn.dataset.tip = 'increment-amount';
        incrementBtn.textContent = this.getIncrementLabel();
        incrementBtn.addEventListener('click', () => {
            this.core.industry.cycleActionIncrement();
            this.updateIncrementControl();
        });

        footer.appendChild(incrementBtn);
        this.prodBox.appendChild(footer);
        this.incrementBtn = incrementBtn;
    }

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    handleTheurgyClick(theurgyType, event) {
        const changes = this.core.industry.performTheurgy(theurgyType);
        const button = this.theurgyButtons[theurgyType];
        if (!button) return;
        button.classList.add("nudged");
        setTimeout(() => {
            button.classList.remove("nudged")
        }, 100);

        this.createParticleExplosion(event);

        changes.forEach(change => {
            this.addResourceFloater(change.res, change);
        })

        this.updateTheurgyButtonStates();
        
        if (theurgyType === 'plant' && this.core.story) {
            this.core.story.dismissInfoBox('theurgy-plant');
        }
    }

    handleBuildAction(type, def) {
        this.handleResourceAction(type, def, t => this.core.industry.buildBuilding(t), 'buildCost', 'drain', 'farm-plot');
    }

    handleSellAction(type, def) {
        this.handleResourceAction(type, def, t => this.core.industry.sellBuilding(t), 'sellReward', 'gain');
    }

    handleWorkerAction(type, action) {
        if (action === 'assign') {
            this.core.industry.assignWorkerToBuilding(type);
        } else {
            this.core.industry.unassignWorkerFromBuilding(type);
        }
        if (type === 'farmPlot' && this.core.story && action === 'assign') {
            this.core.story.dismissInfoBox('farm-plot-worker');
        }
    }

    handleResourceAction(type, def, actionFn, costKey, changeType, storyKey) {
        const result = actionFn(type);
        if (result && def?.[costKey]) {
            Object.entries(def[costKey])
                .map(([res, amt]) => ({res, total: this.getTotalAmount(amt, result)}))
                .filter(({total}) => total > 0)
                .forEach(({res, total}) => this.addResourceFloater(res, {type: changeType, amt: total, res}));
        }
        if (result > 0 && this.core.story && storyKey) {
            this.core.story.dismissInfoBox(storyKey);
            if (type === 'farmPlot') this.core.story.checkFarmPlotWorkerInfo();
        }
    }

    // ============================================================================
    // UI UPDATE METHODS
    // ============================================================================

    updateTheurgyButtonStates() {
        Object.entries(this.theurgyButtons || {}).forEach(([type, btn]) => {
            if (btn) btn.disabled = !this.core.industry.canPerformTheurgy(type);
        });
    }

    updateIncrementControl() {
        if (this.incrementBtn) {
            this.incrementBtn.textContent = this.getIncrementLabel();
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
        
        const progress = this.core.industry.getBuildProgress(type);
        this.updateProgressFill(progressFill, progress);
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
            const progress = this.core.industry.getBuildProgress(type);
            this.updateProgressFill(progressFill, progress);
        }
        
        const resourceProgressIndicator = button.querySelector('.resource-progress-indicator');
        if (resourceProgressIndicator && def && def.buildCost) {
            const progressText = this.getResourceProgressText(type);
            resourceProgressIndicator.textContent = progressText || '';
            resourceProgressIndicator.style.display = progressText ? 'inline' : 'none';
        }
    }

    updateDemolishButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-sell-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Demolish', 'sell', type);
        const details = this.getDemolishButtonDetails(type);
        const sellPlan = this.getActionPlanDetails('sell', type);
        this.updateButtonInfoBox(button, sellPlan.actual > 0 ? details : null);
        
        const warning = this.getDemolishWorkerWarning(type);
        const hasWarning = warning && sellPlan.actual > 0;
        if (hasWarning) {
            button.classList.add('hastip');
            button.dataset.tip = 'demolish-warning';
            button.dataset.buildingType = type;
        } else {
            button.classList.remove('hastip');
            delete button.dataset.tip;
            delete button.dataset.buildingType;
        }
    }

    updateHireButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-add-worker-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Hire', 'hire', type);
        const details = this.getWorkerButtonDetails(type);
        this.updateButtonInfoBox(button, details);
    }

    updateFurloughButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-remove-worker-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Furlough', 'furlough', type);
        const details = this.getFurloughButtonDetails(type);
        const furloughPlan = this.getActionPlanDetails('furlough', type);
        this.updateButtonInfoBox(button, furloughPlan.actual > 0 ? details : null);
    }

    updateButtonStateWithTooltip(button, isEnabled, tipName, buildingType) {
        if (!button) return;
        button.disabled = !isEnabled;
        if (!isEnabled) {
            button.classList.add('hastip');
            button.dataset.tip = tipName;
            button.dataset.buildingType = buildingType;
        } else {
            button.classList.remove('hastip');
            delete button.dataset.tip;
            delete button.dataset.buildingType;
        }
    }

    updateHeaderSpanWithTooltip(headerSpan, hasTooltip, tipName, buildingType, content) {
        if (!headerSpan) return;
        if (hasTooltip) {
            headerSpan.classList.add('hastip');
            headerSpan.dataset.tip = tipName;
            headerSpan.dataset.buildingType = buildingType;
        } else {
            headerSpan.classList.remove('hastip');
            delete headerSpan.dataset.tip;
            delete headerSpan.dataset.buildingType;
        }
        headerSpan.innerHTML = content;
    }

    updateOrCreateTimeSpan(header, timeToNext, tipName, buildingType) {
        let timeSpan = header.querySelector('.header-time');
        if (timeToNext) {
            if (!timeSpan) {
                timeSpan = document.createElement('span');
                timeSpan.className = 'header-time hastip';
                timeSpan.dataset.tip = tipName;
                timeSpan.dataset.buildingType = buildingType;
                header.appendChild(timeSpan);
            }
            timeSpan.textContent = timeToNext;
        } else if (timeSpan) {
            timeSpan.remove();
        }
    }

    updateOrCreateLimitSpan(header, maxWorkers, atLimit, buildingType) {
        let limitSpan = header.querySelector('.header-limit');
        if (!limitSpan) {
            limitSpan = document.createElement('span');
            limitSpan.className = 'header-limit hastip';
            limitSpan.dataset.tip = 'worker-limit';
            limitSpan.dataset.buildingType = buildingType;
            header.appendChild(limitSpan);
        }
        
        const prevLimit = this.previousLimits[buildingType];
        if (prevLimit === undefined) {
            this.previousLimits[buildingType] = maxWorkers;
        } else if (maxWorkers < prevLimit) {
            this.createRateIndicator(limitSpan, false);
            this.previousLimits[buildingType] = maxWorkers;
        } else if (maxWorkers !== prevLimit) {
            this.previousLimits[buildingType] = maxWorkers;
        }
        
        const limitText = `Limit: ${maxWorkers}`;
        if (limitSpan.textContent !== limitText) {
            limitSpan.textContent = limitText;
        }
        limitSpan.classList.toggle('at-limit', atLimit);
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

    updateProgressFill(progressFill, progress) {
        if (!progressFill) return;
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
            progressFill.style.borderRight = '1px solid color-mix(in oklab, var(--bgColor) 35%, var(--accent))';
        }
        
        progressFill.dataset.prevWidth = newWidth.toString();
    }

    updateWorkerWarnings(sectionBody, type) {
        const warnings = {
            'worker-strike': {
                show: this.core.industry.workersOnStrike,
                text: '⚠ Workers on strike (insufficient food)',
                className: 'worker-strike'
            },
            'worker-limited': {
                show: this.areWorkersScaled() && !this.core.industry.workersOnStrike,
                text: `⚠ Worker output throttled by ${this.getBottleneckText()} supply`,
                className: 'worker-limited hastip',
                attrs: {tip: 'worker-limited', buildingType: type}
            },
            'worker-drain-warning': {
                show: !this.core.industry.workersOnStrike && !this.areWorkersScaled(),
                text: () => {
                    const drainExceedsGain = this.core.industry.getDrainExceedsGainResources(type);
                    return drainExceedsGain.length > 0 ? `⚠ Worker input ${drainExceedsGain.join(', ')} is at a deficit.` : null;
                },
                className: 'worker-drain-warning'
            }
        };

        Object.entries(warnings).forEach(([selector, config]) => {
            const div = sectionBody.querySelector(`.${selector}`);
            const shouldShow = config.show && (typeof config.text === 'function' ? config.text() : config.text);
            
            if (shouldShow) {
                if (div) {
                    div.textContent = typeof config.text === 'function' ? config.text() : config.text;
                } else {
                    const el = document.createElement('div');
                    el.className = config.className;
                    el.textContent = typeof config.text === 'function' ? config.text() : config.text;
                    if (config.attrs) Object.assign(el.dataset, config.attrs);
                    sectionBody.appendChild(el);
                }
            } else if (div) {
                div.remove();
            }
        });
    }

    // ============================================================================
    // UI CREATION HELPERS
    // ============================================================================

    createBuildingCard(type, building, def) {
        const row = document.createElement('div');
        row.className = 'building-row';

        const mainBtn = document.createElement('button');
        mainBtn.className = 'building-main-btn';
        mainBtn.dataset.buildingType = type;
        mainBtn.style.position = 'relative';
        const hasBuildCost = def && def.buildCost && Object.keys(def.buildCost).length > 0;
        mainBtn.innerHTML = `
            <div class="build-progress-fill"></div>
            <span class="building-title">${def ? def.name : type} <span class="building-count">(${building.count})</span></span>
            <span class="resource-progress-indicator" style="display: ${hasBuildCost ? '' : 'none'}"></span>
        `;
        const titleSpan = mainBtn.querySelector('.building-title');
        if (titleSpan) {
            titleSpan.classList.add('hastip');
            titleSpan.dataset.tip = 'building-lore';
            titleSpan.dataset.buildingType = type;
        }
        mainBtn.onclick = () => this.handleBuildAction(type, def);

        const workerBtn = document.createElement('button');
        workerBtn.className = 'building-worker-btn';
        const workerCount = building.workers || 0;
        workerBtn.innerHTML = `
            <span class="worker-btn-count">${workerCount}</span>
        `;
        const initialHirePlan = this.getActionPlanDetails('hire', type);
        const canHire = initialHirePlan.actual > 0;
        workerBtn.disabled = !canHire;
        if (!canHire) {
            workerBtn.classList.add('hastip');
            workerBtn.dataset.tip = 'hire-disabled';
            workerBtn.dataset.buildingType = type;
        }
        
        workerBtn.onclick = (e) => {
            e.stopPropagation();
            this.handleWorkerAction(type, 'assign');
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
            dropdown.classList.toggle('dropped', building.dropped);
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
            addWorkerBtn.onclick = () => this.handleWorkerAction(type, 'assign');
        }

        const removeWorkerBtn = dropdown.querySelector('.dropdown-remove-worker-btn');
        if (removeWorkerBtn) {
            removeWorkerBtn.onclick = () => this.handleWorkerAction(type, 'unassign');
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
        const canBuild = this.canBuildBuilding(type);
        const canSell = b.count > 0;
        const aggregateEffects = this.getAggregateBuildingEffects(type);
        const timeToNext = this.getTimeUntilNextBuilding(type);
        
        return `
            <div class="dropdown-section dropdown-building">
                <div class="dropdown-section-header">
                    <span ${aggregateEffects ? `class="hastip" data-tip="building-effects" data-building-type="${type}"` : ''}>BUILDING${aggregateEffects ? ` (${aggregateEffects})` : ''}</span>
                    ${timeToNext ? `<span class="header-time hastip" data-tip="time-to-next" data-building-type="${type}">${timeToNext}</span>` : ''}
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
                            <button class="dropdown-sell-btn ${!canSell ? 'hastip' : ''}" ${!canSell ? `disabled data-tip="demolish-disabled" data-building-type="${type}"` : ''}>Demolish</button>
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
        const aggregateWorkerEffects = this.getAggregateWorkerEffects(type);
        const maxWorkers = this.core.industry.getMaxWorkers(type);
        
        return `
            <div class="dropdown-section dropdown-workers">
                <div class="dropdown-section-header">
                    <span ${aggregateWorkerEffects ? `class="hastip" data-tip="worker-effects" data-building-type="${type}"` : ''}>WORKERS${aggregateWorkerEffects ? ` (${aggregateWorkerEffects})` : ''}</span>
                    <span class="header-limit hastip" data-tip="worker-limit" data-building-type="${type}">Limit: ${maxWorkers}</span>
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-worker-btn ${!canAdd ? 'hastip' : ''}" ${!canAdd ? `disabled data-tip="hire-disabled" data-building-type="${type}"` : ''}>
                                Hire
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="dropdown-remove-worker-btn ${!canRemove ? 'hastip' : ''}" ${!canRemove ? `disabled data-tip="furlough-disabled" data-building-type="${type}"` : ''}>Furlough</button>
                        </div>
                    </div>
                    ${onStrike ? `
                    <div class="worker-strike">⚠ Workers on strike (insufficient food)</div>
                    ` : ''}
                    ${isScaled && !onStrike ? `
                    <div class="worker-limited hastip" data-tip="worker-limited" data-building-type="${type}">⚠ Worker output limited by ${this.getBottleneckText()}</div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ============================================================================
    // FORMATTING & CALCULATION HELPERS
    // ============================================================================

    formatActionLabel(baseText, action, type) {
        if (!this.isMultiIncrementActive()) return baseText;
        const plan = this.getActionPlanDetails(action, type);
        const value = plan.selected === 'max' ? plan.actual : plan.target;
        return value > 1 ? `${baseText} x${value}` : baseText;
    }

    formatTime(seconds) {
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
        return `${Math.ceil(seconds / 86400)}d`;
    }

    getResourceProgressText(type) {
        const progress = this.core.industry.getResourceProgress(type);
        return progress ? `${progress.current}/${progress.required}` : '';
    }

    getAggregateBuildingEffects(type) {
        const effects = this.core.industry.getAggregateBuildingEffects(type);
        if (!effects) return null;
        
        const items = Object.entries(effects).flatMap(([res, {gain, drain}]) => {
            const items = [];
            if (gain) {
                items.push(`<span style="color: var(--gainColor)">+${gain.toFixed(2)} ${res}/s</span>`);
            }
            if (drain) {
                items.push(`<span style="color: var(--drainColor)">-${drain.toFixed(2)} ${res}/s</span>`);
            }
            return items;
        });
        
        return items.length > 0 ? items.join(',&nbsp;') : null;
    }

    getAggregateWorkerEffects(type) {
        const effects = this.core.industry.getAggregateWorkerEffects(type);
        if (!effects) return null;
        
        const items = Object.entries(effects)
            .map(([res, net]) => {
                const isGain = net > 0;
                return `<span style="color: var(--${isGain ? 'gain' : 'drain'}Color)">${isGain ? '+' : ''}${net.toFixed(2)} ${res}/s</span>`;
            });
        
        return items.length > 0 ? items.join(',&nbsp;') : null;
    }

    getTimeUntilNextBuilding(type) {
        const seconds = this.core.industry.getTimeUntilNextBuilding(type);
        return seconds !== null ? this.formatTime(seconds) : null;
    }

    getButtonDetails(type, action, getEffectsFn) {
        const result = getEffectsFn(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails(action, type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const costs = result.costs?.map(c => ({res: c.res, amt: c.amt * multiplier})) || [];
        const rewards = result.rewards?.map(r => ({res: r.res, amt: r.amt * multiplier})) || [];
        const effects = Object.entries(result.effects || {}).map(([res, val]) => ({
            res, val: Math.abs(val) * multiplier, type: val > 0 ? 'gain' : 'drain'
        }));
        
        return {costs, rewards, effects};
    }

    getBuildingButtonDetails(type) {
        return this.getButtonDetails(type, 'build', t => this.core.industry.getBuildEffects(t));
    }

    getDemolishButtonDetails(type) {
        return this.getButtonDetails(type, 'sell', t => this.core.industry.getDemolishEffects(t));
    }

    getFurloughButtonDetails(type) {
        return this.getButtonDetails(type, 'furlough', t => this.core.industry.getFurloughWorkerEffects(t));
    }

    getWorkerButtonDetails(type) {
        const result = this.core.industry.getHireWorkerEffects(type);
        if (!result) return null;
        
        const plan = this.getActionPlanDetails('hire', type);
        const multiplier = plan.selected === 'max' ? plan.actual : plan.target;
        
        const {costs, effects} = Object.entries(result.effects || {}).reduce((acc, [res, val]) => {
            const item = {res, val: Math.abs(val) * multiplier, type: val < 0 ? 'drain' : 'gain'};
            (val < 0 ? acc.costs : acc.effects).push(item);
            return acc;
        }, {costs: [], effects: []});
        
        return {costs, effects};
    }

    renderButtonInfoBox(details) {
        if (!details) return '';
        
        const accumulate = (items, prefix, getKey) => 
            items?.reduce((map, item) => {
                const key = getKey(item);
                if (key) map.set(key, (map.get(key) || 0) + (item.amt ?? item.val ?? 0));
                return map;
            }, new Map()) || new Map();
        
        const itemMap = new Map([
            ...accumulate(details.costs, 'cost', c => c.amt !== undefined ? `cost_${c.res}_amt` : (c.val !== undefined && c.res ? `cost_${c.res}_val` : null)),
            ...accumulate(details.rewards, 'reward', r => `reward_${r.res}_amt`),
            ...accumulate(details.effects, 'effect', e => `effect_${e.res}_${e.type}`)
        ]);
        
        const formatItem = (key, total) => {
            const [, res, type] = key.split('_');
            const isAmt = type === 'amt';
            const isDrain = type === 'drain';
            const isCost = key.startsWith('cost_');
            
            if (isCost) {
                return `<span class="info-cost">-${isAmt ? total : total.toFixed(2)} ${res}${isAmt ? '' : '/s'}</span>`;
            }
            if (key.startsWith('reward_')) {
                return `<span class="info-effect effect-gain">+${total} ${res}</span>`;
            }
            return `<span class="info-effect effect-${isDrain ? 'drain' : 'gain'}">${isDrain ? '-' : '+'}${total.toFixed(2)} ${res}/s</span>`;
        };
        
        const items = Array.from(itemMap.entries())
            .map(([key, total]) => ({key, total, isNegative: key.startsWith('cost_') || key.includes('_drain')}))
            .sort((a, b) => a.isNegative ? -1 : 1)
            .map(({key, total}) => formatItem(key, total));
        
        return items.length > 0 ? `<span class="info-items">${items.join('')}</span>` : '';
    }

    getBottleneckText() {
        const bottlenecks = this.core.industry.getBottleneckResources();
        return bottlenecks.join(', ') || 'input';
    }

    canBuildBuilding(type) {
        return this.getActionPlanDetails('build', type).actual > 0;
    }

    getBuildDisabledReason(type, def) {
        if (!def?.buildCost) return '';
        const plan = this.getActionPlanDetails('build', type);
        if (plan.actual > 0) return '';
        
        const missing = Object.entries(def.buildCost)
            .map(([res, cost]) => {
                const resObj = this.core.industry.resources[res];
                if (!resObj) return `${res} (missing)`;
                const costNum = this.getValueNumber(cost);
                if (costNum <= 0) return null;
                const current = resObj.value.toNumber();
                return current < costNum ? `${res} (need ${costNum.toFixed(1)}, have ${current.toFixed(1)})` : null;
            })
            .filter(r => r !== null);
        
        return missing.length > 0 ? `Not enough: ${missing.join(', ')}` : 'Cannot build';
    }

    getDemolishDisabledReason(type) {
        const plan = this.getActionPlanDetails('sell', type);
        if (plan.actual > 0) return '';
        const b = this.core.industry.buildings[type];
        return !b?.count ? 'No buildings to demolish' : 'Cannot demolish';
    }

    getHireDisabledReason(type) {
        const plan = this.getActionPlanDetails('hire', type);
        if (plan.actual > 0) return '';
        
        const b = this.core.industry.buildings[type];
        if (!b?.count) return 'No buildings';
        
        const maxWorkers = this.core.industry.getMaxWorkers(type);
        const availableSlots = maxWorkers - (b.workers || 0);
        
        if (availableSlots <= 0) return `Worker limit reached (${maxWorkers})`;
        if (this.core.industry.unassignedWorkers <= 0) return 'No available workers';
        return 'Cannot hire';
    }

    getFurloughDisabledReason(type) {
        const plan = this.getActionPlanDetails('furlough', type);
        if (plan.actual > 0) return '';
        const b = this.core.industry.buildings[type];
        return !b?.workers ? 'No workers to furlough' : 'Cannot furlough';
    }

    getDemolishWorkerWarning(type) {
        const warning = this.core.industry.getDemolishWorkerWarning(type);
        return warning ? `⚠ Employees: ${warning.currentWorkers} → ${warning.newWorkers} (new limit)` : null;
    }

    getPlanTarget(action, type) {
        const plan = this.getActionPlanDetails(action, type);
        return plan.target || 0;
    }

    getActionPlanDetails(action, type) {
        return this.core.industry.getActionPlan(action, type);
    }

    isMultiIncrementActive() {
        const inc = this.core.industry.getSelectedIncrement();
        return inc === 'max' || inc > 1;
    }

    areWorkersScaled() {
        const scale = this.core.industry.getWorkerScalingFactor();
        return scale < 1 && scale > 0;
    }

    hasBuildingStateChanged(data) {
        if (!data.buildings) return false;
        
        const currentState = Object.fromEntries(
            Object.entries(data.buildings).map(([type, b]) => [
                type,
                { count: b.count || 0, workers: b.workers || 0 }
            ])
        );
        
        const prevState = this.previousBuildingState;
        const changed = Object.keys(currentState).some(type => {
            const prev = prevState[type];
            const current = currentState[type];
            return !prev || prev.count !== current.count || prev.workers !== current.workers;
        }) || Object.keys(prevState).some(type => !currentState[type]);
        
        this.previousBuildingState = currentState;
        return changed;
    }

    getIncrementLabel() {
        const inc = this.core.industry.getSelectedIncrement();
        return inc === 'max' ? 'Max' : `x${inc}`;
    }

    getValueNumber(value) {
        return value?.toNumber?.() ?? (Number(value) || 0);
    }

    getTotalAmount(value, count) {
        if (!count) return 0;
        const total = this.getValueNumber(value) * count;
        return Math.round(total * 100) / 100;
    }

    toggleView() {
        this.isExpanded = !this.isExpanded;
        if (this.core.industry.configs) {
            this.core.industry.configs.resourceBoxExpanded = this.isExpanded;
        }
        this.resourcebox.classList.add("animatingWidth");
        this.resourcebox.classList.toggle("expanded", this.isExpanded);
        setTimeout(() => this.resourcebox.classList.remove("animatingWidth"), 320);
        if (this.isExpanded && this.core.industry) {
            this.render(this.core.industry.getData());
        }
    }

    // ============================================================================
    // VISUAL EFFECTS
    // ============================================================================

    createParticleExplosion(event) {
        const GRAVITY = 0.05;
        const DRAG = 0.97;
        const LIFESPAN = 70;

        const particles = [];

        const startX = event.clientX;
        const startY = event.clientY;
        const count = 5 + Math.floor(Math.random() * 3);

        const canvas = this.core.ui.canvas;
        const ctx = canvas.getContext('2d');

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
            indicator.style.transform = `translateY(${isIncrease ? -9.5 : 9.5}px) scale(0.75)`;
        });
        
        setTimeout(() => indicator.remove(), 1000);
    }

    addResourceFloater(resourceName, change) {
        const resourceRow = this.resourcebox._rows[resourceName];
        if (!resourceRow) return;

        const res = this.core.industry.resources[resourceName];
        const cap = res && res.effectiveCap;
        const atCap = cap && res.value.toNumber() >= cap.toNumber();

        const floatingText = document.createElement("div");
        floatingText.textContent = `${change.type === "gain" ? "+" : "-"}${change.amt}`;
        floatingText.className = "resourceFloater";
        floatingText.style.color = change.type === "gain" ? "var(--gainColor)" : "var(--drainColor)";
        
        if (atCap && change.type === "gain") {
            floatingText.style.color = "var(--baseColor)";
            floatingText.textContent = "+0";
        }

        const nameText = resourceRow.nameText;
        const textRect = nameText.getBoundingClientRect();
        const spanRect = resourceRow.nameSpan.getBoundingClientRect();

        const availableSpace = spanRect.right - textRect.right;
        const minDistance = availableSpace * 0.1;
        const randomX = textRect.right + minDistance + Math.random() * (availableSpace * 0.9);
        floatingText.style.left = `${randomX}px`;
        floatingText.style.top = `${textRect.top + 5}px`;

        document.body.appendChild(floatingText);

        requestAnimationFrame(() => {
            floatingText.style.opacity = "0";
            floatingText.style.transform = "translateY(-10px) scale(0.75)";
        });

        setTimeout(() => floatingText.remove(), 1200);
    }

    // ============================================================================
    // LIFECYCLE
    // ============================================================================

    updateVisibility(loc, panel) {
        this.core.industry.updateLoops();
        if (loc === "center") {
            this.root.classList.toggle("shown", panel === "industry");
        }
    }
}
