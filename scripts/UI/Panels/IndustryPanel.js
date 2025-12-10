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

    fmt(val, opt = {}) {
        return this.core.ui.formatNumber(val, opt);
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
        const formatValueParts = (val) => {
            const num = val && typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
            const absNum = Math.abs(num);
            
            // For numbers < 1000, always show 2 decimal places to prevent flickering
            if (absNum < 1000) {
                const formatted = num.toFixed(2);
                const parts = formatted.split('.');
                return {int: parts[0], dec: '.' + parts[1], exp: '', hasAbbrev: false};
            }
            
            // For numbers >= 1000, use the normal formatter with consistent decimals
            const formatted = this.fmt(val, { decimalPlaces: 2 });

            // Check if it has an abbreviation (k, m, b, t, q, or alphabetical letters)
            const abbrevMatch = formatted.match(/^[+-]?[\d.]+([a-z]+)$/);
            const hasAbbrev = !!abbrevMatch;

            // Check if it's scientific notation (contains 'e')
            if (formatted.includes('e')) {
                // Scientific notation - render normally, no shrinking
                return {int: formatted, dec: '', exp: '', hasAbbrev: false};
            }

            // If it has an abbreviation, render the whole thing normally
            if (hasAbbrev) {
                return {int: formatted, dec: '', exp: '', hasAbbrev: true};
            }

            // Regular format without abbreviation - split for styling
            const parts = formatted.split('.');
            const intPart = parts[0];
            const decPart = parts.length > 1 ? '.' + parts[1] : '';
            return {int: intPart, dec: decPart, exp: '', hasAbbrev: false};
        };

        const formatRate = (val) => this.fmt(val, { decimalPlaces: 2 });

        const buildingStateChanged = this.hasBuildingStateChanged(data);

        Object.entries(data.resources).forEach(([k, v]) => {
            if (this.resourcebox._rows[k]) {
                const {valueSpan, rateSpan, row} = this.resourcebox._rows[k];
                const parts = formatValueParts(v.value);
                if (this.isExpanded || window.matchMedia('(width <= 950px)').matches) {
                    // Only shrink decimal if there's no abbreviation (real decimal of resource)
                    if (parts.hasAbbrev || !parts.dec) {
                        valueSpan.textContent = parts.int + parts.dec + parts.exp;
                    } else {
                        valueSpan.innerHTML = `${parts.int}<span style="opacity: 0.5;font-size:0.8em;">${parts.dec}</span>${parts.exp}`;
                    }
                } else {
                    valueSpan.textContent = parts.int + parts.dec + parts.exp;
                }

                const cap = v.effectiveCap;
                if (cap !== undefined) {
                    const currentVal = v.value.toNumber();
                    const capVal = cap.toNumber();
                    const percent = Math.min(100, (currentVal / capVal) * 100);
                    row.style.setProperty('--cap-percent', percent / 100);
                    row.classList.add('has-cap');
                } else {
                    row.classList.remove('has-cap');
                }

                // Calculate throttled rate on-the-fly to match tooltip
                const breakdown = this.core.industry.getResourceProductionBreakdown(k);
                const rateNum = breakdown ? breakdown.baseGain + breakdown.workerGain - breakdown.baseDrain - breakdown.workerDrain : 0;

                const showRate = this.isExpanded || window.matchMedia('(width <= 950px)').matches;
                const prevRate = this.previousRates[k];

                if (showRate) {
                    if (rateNum !== 0 && prevRate !== undefined && Math.abs(rateNum - prevRate) > 0.1 && buildingStateChanged) {
                        const isIncrease = rateNum > prevRate;
                        this.createRateIndicator(rateSpan, isIncrease);
                    }

                    rateSpan.textContent = (rateNum >= 0 ? '+' : '') + formatRate(rateNum);
                    rateSpan.classList.toggle('positive', rateNum > 0);
                    rateSpan.classList.toggle('negative', rateNum < 0);
                    if (rateNum === 0) rateSpan.classList.remove('positive', 'negative');

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
                } else {
                    this.previousRates[k] = rateNum;
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

                
                const canBuild = buildPlan.actual > 0;
                if (card.addBuildingBtn) this.updateButtonStateWithTooltip(card.addBuildingBtn, canBuild, 'build', type);
                if (card.mainBtn && def?.buildCost) this.updateButtonStateWithTooltip(card.mainBtn, canBuild, 'build', type);
                
                if (card.sellBtn) {
                    const canSell = sellPlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.sellBtn, canSell, 'demolish', type);
                }
                
                if (card.addWorkerBtn) {
                    const canHire = hirePlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.addWorkerBtn, canHire, 'hire', type);
                }
                
                if (card.removeWorkerBtn) {
                    const canFurlough = furloughPlan.actual > 0;
                    this.updateButtonStateWithTooltip(card.removeWorkerBtn, canFurlough, 'furlough', type);
                }
                
                this.updateMainButton(card, type, def);
                this.updateWorkerButton(card, type, b);

                this.updateBuildButton(card, type);
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
                    this.updateOrCreateLimitSpan(workerHeader, maxWorkers, type);
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
            this.freeWorkersSpan.textContent = `Free: ${this.core.ui.formatNumber(Math.floor(freeWorkers))}`;
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
                this.core.ui.hookTip(btn, `theurgy-${type}`);
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
        nameSpan.classList.add("resource-name");
        this.core.ui.hookTip(nameSpan, 'resource-name');
        nameSpan.dataset.resource = resource;

        const nameText = document.createElement("span");
        nameText.classList.add("resource-text");

        nameText.textContent = resource.replace(/\w\S*/g, txt => 
            txt[0].toUpperCase() + txt.slice(1).toLowerCase()
        );

        const rateSpan = document.createElement("span");
        rateSpan.classList.add("resource-rate");
        this.core.ui.hookTip(rateSpan, 'resource-rate');
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
        incrementBtn.className = 'prod-increment';
        this.core.ui.hookTip(incrementBtn, 'increment-amount');
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

    updateBuildButton(card, type) {
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
        
        button.dataset.buildingType = type;
        
        const plan = this.getActionPlanDetails('build', type);
        const shouldShowTooltip = plan.actual <= 0 || (plan.actual > 0 && plan.actual < plan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'build');
        } else {
            this.core.ui.unhookTip(button, 'build');
        }
    }

    updateMainButton(card, type, def) {
        const button = card.mainBtn;
        if (!button) return;
        
        const titleSpan = button.querySelector('.building-title');
        if (titleSpan) {
            let incrementSpan = titleSpan.querySelector('.building-increment');
            const buildPlan = this.getActionPlanDetails('build', type);
            const incVal = buildPlan.selected === 'max' ? buildPlan.actual : buildPlan.target;
            if (this.isMultiIncrementActive() && incVal > 1) {
                if (!incrementSpan) {
                    incrementSpan = document.createElement('span');
                    incrementSpan.className = 'building-increment';
                    titleSpan.insertBefore(incrementSpan, titleSpan.firstChild);
                }
                incrementSpan.textContent = ` x${incVal} `;
            } else if (incrementSpan) {
                incrementSpan.remove();
            }
        }
        
        const progressFill = button.querySelector('.build-progress-fill');
        if (progressFill) {
            const progress = this.core.industry.getBuildProgress(type);
            this.updateProgressFill(progressFill, progress);
        }
        
        const costIndicator = button.querySelector('.cost-indicator');
        if (costIndicator && def && def.buildCost) {
            const progressText = this.getResourceProgressText(type);
            costIndicator.textContent = progressText || '';
            costIndicator.style.display = progressText ? 'inline' : 'none';
        }
        
        const buildPlan = this.getActionPlanDetails('build', type);
        const dropdown = card?.dropdown;
        const isDropdownOpen = dropdown?.classList.contains('dropped');
        const shouldShowTooltip = buildPlan.actual <= 0 || !isDropdownOpen || (isDropdownOpen && buildPlan.actual < buildPlan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'build');
            button.dataset.buildingType = type;
        } else {
            this.core.ui.unhookTip(button, 'build');
        }
    }

    updateWorkerButton(card, type, b) {
        const button = card.workerBtn;
        if (!button) return;
        
        const workerCount = b.workers || 0;
        const onStrike = this.core.industry.workersOnStrike;
        const isScaled = this.areWorkersScaled();

        if (card.workerBtnCount) {
            card.workerBtnCount.textContent = workerCount;
            const classes = { 'on-strike': onStrike && workerCount > 0, 'limited': isScaled && workerCount > 0 };
            Object.entries(classes).forEach(([cls, active]) =>
                card.workerBtnCount.classList.toggle(cls, active)
            );
        }
        
        const hirePlan = this.getActionPlanDetails('hire', type);
        const canHire = hirePlan.actual > 0;
        button.disabled = !canHire;
        
        const dropdown = card?.dropdown;
        const isDropdownOpen = dropdown?.classList.contains('dropped');
        const shouldShowTooltip = !canHire || !isDropdownOpen || (isDropdownOpen && hirePlan.actual < hirePlan.target);
        
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'hire');
            button.dataset.buildingType = type;
        } else {
            this.core.ui.unhookTip(button, 'hire');
        }
    }

    updateDemolishButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-building .dropdown-sell-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Demolish', 'sell', type);
        const details = this.getDemolishButtonDetails(type);
        const sellPlan = this.getActionPlanDetails('sell', type);
        this.updateButtonInfoBox(button, sellPlan.actual > 0 ? details : null);
        
        button.dataset.buildingType = type;
        
        const shouldShowTooltip = sellPlan.actual <= 0 || (sellPlan.actual > 0 && sellPlan.actual < sellPlan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'demolish');
        } else {
            this.core.ui.unhookTip(button, 'demolish');
        }
        
        const warning = this.getDemolishWorkerWarning(type);
        const hasWarning = warning && sellPlan.actual > 0;
        if (hasWarning) {
            this.core.ui.hookTip(button, 'demolish-warning');
        } else {
            this.core.ui.unhookTip(button, 'demolish-warning');
        }
    }

    updateHireButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-add-worker-btn');
        if (!button) return;
        
        const textNodeType = (typeof Node !== 'undefined' && Node.TEXT_NODE) || 3;
        Array.from(button.childNodes).forEach(node => {
            if (node.nodeType === textNodeType && node.textContent.trim().length) {
                node.remove();
            }
        });
        
        let progressFill = button.querySelector('.hire-progress-fill');
        if (!progressFill) {
            progressFill = document.createElement('div');
            progressFill.className = 'hire-progress-fill';
            button.prepend(progressFill);
        }
        
        let labelSpan = button.querySelector('.hire-btn-label');
        if (!labelSpan) {
            labelSpan = document.createElement('span');
            labelSpan.className = 'hire-btn-label';
            labelSpan.style.position = 'relative';
            labelSpan.style.zIndex = '1';
            button.appendChild(labelSpan);
        }
        labelSpan.textContent = this.formatActionLabel('Hire', 'hire', type);
        
        const details = this.getWorkerButtonDetails(type);
        this.updateButtonInfoBox(button, details);
        
        const progress = this.core.industry.getHireProgress(type);
        this.updateProgressFill(progressFill, progress);
        
        const plan = this.getActionPlanDetails('hire', type);
        const shouldShowTooltip = plan.actual <= 0 || (plan.actual > 0 && plan.actual < plan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'hire');
            button.dataset.buildingType = type;
        } else {
            this.core.ui.unhookTip(button, 'hire');
        }
    }

    updateFurloughButton(card, type) {
        const button = card.dropdown?.querySelector('.dropdown-workers .dropdown-remove-worker-btn');
        if (!button) return;
        
        button.textContent = this.formatActionLabel('Furlough', 'furlough', type);
        const details = this.getFurloughButtonDetails(type);
        const furloughPlan = this.getActionPlanDetails('furlough', type);
        this.updateButtonInfoBox(button, furloughPlan.actual > 0 ? details : null);
        
        button.dataset.buildingType = type;
        
        const shouldShowTooltip = furloughPlan.actual <= 0 || (furloughPlan.actual > 0 && furloughPlan.actual < furloughPlan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'furlough');
        } else {
            this.core.ui.unhookTip(button, 'furlough');
        }
    }

    updateButtonStateWithTooltip(button, isEnabled, tipName, buildingType) {
        if (!button) return;
        button.disabled = !isEnabled;
        
        if (buildingType && (tipName === 'build' || tipName === 'hire' || tipName === 'demolish' || tipName === 'furlough')) {
            const action = tipName === 'build' ? 'build' : tipName === 'hire' ? 'hire' : tipName === 'demolish' ? 'sell' : 'furlough';
            const plan = this.getActionPlanDetails(action, buildingType);
            const shouldShowTooltip = plan.actual <= 0 || (plan.actual > 0 && plan.actual < plan.target);
            
            if (shouldShowTooltip) {
                this.core.ui.hookTip(button, tipName);
                button.dataset.buildingType = buildingType;
            } else {
                this.core.ui.unhookTip(button, tipName);
            }
        } else {
            if (isEnabled) {
                this.core.ui.unhookTip(button, tipName);
            } else {
                this.core.ui.hookTip(button, tipName);
                if (buildingType) button.dataset.buildingType = buildingType;
            }
        }
    }

    updateHeaderSpanWithTooltip(headerSpan, hasTooltip, tipName, buildingType, content) {
        if (!headerSpan) return;
        if (hasTooltip) {
            this.core.ui.hookTip(headerSpan, tipName);
            headerSpan.dataset.buildingType = buildingType;
        } else {
            this.core.ui.unhookTip(headerSpan, tipName);
        }
        headerSpan.innerHTML = content;
    }

    updateOrCreateTimeSpan(header, timeToNext, tipName, buildingType) {
        let timeSpan = header.querySelector('.header-time');
        if (timeToNext) {
            if (!timeSpan) {
                timeSpan = document.createElement('span');
                timeSpan.className = 'header-time';
                this.core.ui.hookTip(timeSpan, tipName);
                timeSpan.dataset.buildingType = buildingType;
                header.appendChild(timeSpan);
            }
            timeSpan.textContent = timeToNext;
        } else if (timeSpan) {
            timeSpan.remove();
        }
    }

    updateOrCreateLimitSpan(header, maxWorkers, buildingType) {
        let limitSpan = header.querySelector('.header-limit');
        if (!limitSpan) {
            limitSpan = document.createElement('span');
            limitSpan.className = 'header-limit';
            this.core.ui.hookTip(limitSpan, 'worker-limit');
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
        
        const b = this.core.industry.buildings[buildingType];
        const workers = b ? b.workers || 0 : 0;
        const limitText = `${workers}/${maxWorkers}`;
        if (limitSpan.textContent !== limitText) {
            limitSpan.textContent = limitText;
        }
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
                this.core.ui.hookTip(infoBox, 'info-box-breakdown');
            }
            infoBox.innerHTML = content;
        } else if (infoBox) {
            this.core.ui.unhookTip(infoBox, 'info-box-breakdown');
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
                attrs: {tips: 'worker-limited', buildingType: type}
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
            <span class="cost-indicator" style="display: ${hasBuildCost ? '' : 'none'}"></span>
        `;

        const buildPlan = this.getActionPlanDetails('build', type);
        const isDropdownOpen = building.dropped === true;
        const shouldShowBuildTooltip = buildPlan.actual <= 0 || (buildPlan.actual > 0 && buildPlan.actual < buildPlan.target) || (!isDropdownOpen && buildPlan.actual >= buildPlan.target);
        if (shouldShowBuildTooltip) {
            this.core.ui.hookTip(mainBtn, 'build');
            mainBtn.dataset.buildingType = type;
        }
        mainBtn.onclick = () => this.handleBuildAction(type, def);

        const workerBtn = document.createElement('button');
        workerBtn.className = 'building-worker-btn';
        workerBtn.dataset.buildingType = type;
        const workerCount = building.workers || 0;
        workerBtn.innerHTML = `
            <span class="worker-btn-count">${workerCount}</span>
        `;
        const initialHirePlan = this.getActionPlanDetails('hire', type);
        const canHire = initialHirePlan.actual > 0;
        workerBtn.disabled = !canHire;
        const shouldShowHireTooltip = initialHirePlan.actual <= 0 || (initialHirePlan.actual > 0 && initialHirePlan.actual < initialHirePlan.target);
        if (shouldShowHireTooltip) {
            this.core.ui.hookTip(workerBtn, 'hire');
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
            this.updateMainButton(this.buildingCards[type], type, def);
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
                    <span ${aggregateEffects ? `class="hastip" data-tips="building-effects" data-building-type="${type}"` : ''}>BUILDING${aggregateEffects ? ` (${aggregateEffects})` : ''}</span>
                    ${timeToNext ? `<span class="header-time hastip" data-tips="time-to-next" data-building-type="${type}">${timeToNext}</span>` : ''}
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-building-btn" data-building-type="${type}" ${!canBuild ? 'disabled' : ''} style="position: relative;">
                                <div class="build-progress-fill"></div>
                                Build
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="dropdown-sell-btn" ${!canSell ? 'disabled' : ''} data-building-type="${type}">Demolish</button>
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
                    <span ${aggregateWorkerEffects ? `class="hastip" data-tips="worker-effects" data-building-type="${type}"` : ''}>WORKERS${aggregateWorkerEffects ? ` (${aggregateWorkerEffects})` : ''}</span>
                    <span class="header-limit hastip" data-tips="worker-limit" data-building-type="${type}">${workerCount}/${maxWorkers}</span>
                </div>
                <div class="dropdown-section-body">
                    <div class="action-buttons">
                        <div class="button-with-info">
                            <button class="dropdown-add-worker-btn ${!canAdd ? 'hastip' : ''}" data-building-type="${type}" ${!canAdd ? `disabled data-tips="hire"` : ''} style="position: relative;">
                                <div class="hire-progress-fill"></div>
                                <span class="hire-btn-label" style="position: relative; z-index: 1;">Hire</span>
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="dropdown-remove-worker-btn" ${!canRemove ? 'disabled' : ''} data-building-type="${type}">Furlough</button>
                        </div>
                    </div>
                    ${onStrike ? `
                    <div class="worker-strike">⚠ Workers on strike (insufficient food)</div>
                    ` : ''}
                    ${isScaled && !onStrike ? `
                    <div class="worker-limited hastip" data-tips="worker-limited" data-building-type="${type}">⚠ Worker output limited by ${this.getBottleneckText()}</div>
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

        let displayValue;
        if (plan.selected === 'max') {
            displayValue = plan.actual;
        } else {
            // For build and hire actions, always show the selected target increment
            // For other actions, show the target but cap it at what's possible
            if (action === 'build' || action === 'hire') {
                if (action === 'hire') {
                    const maxWorkers = this.core.industry.getMaxWorkers(type);
                    const b = this.core.industry.buildings[type];
                    const capacity = maxWorkers - (b?.workers || 0);
                    // When hire button is disabled due to no buildings, show x1 instead of x0
                    displayValue = capacity === 0 ? 1 : plan.target;
                } else {
                    displayValue = plan.target;
                }
            } else {
                let capacity;
                if (action === 'furlough') {
                    const b = this.core.industry.buildings[type];
                    capacity = b?.workers || 0;
                } else if (action === 'sell') {
                    const b = this.core.industry.buildings[type];
                    capacity = b?.count || 0;
                } else {
                    capacity = plan.limit;
                }
                displayValue = Math.min(capacity, plan.target);
            }
        }

        return displayValue > 1 ? `${baseText} x${displayValue}` : baseText;
    }

    formatTime(seconds) {
        if (seconds < 60) return `${Math.ceil(seconds)}s`;
        if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
        return `${Math.ceil(seconds / 86400)}d`;
    }

    getResourceProgressText(type) {
        const def = this.defs[type];
        if (!def?.buildCost) return '';
        
        const plan = this.getActionPlanDetails('build', type);
        const multiplier = plan.target || 1;
        
        const costs = Object.entries(def.buildCost)
            .map(([res, amt]) => {
                const total = this.getTotalAmount(amt, multiplier);
                return `${this.core.ui.formatNumber(total)} ${res}`;
            });
        
        return costs.join(', ');
    }

    getAggregateBuildingEffects(type) {
        const effects = this.core.industry.getAggregateBuildingEffects(type);
        if (!effects) return null;

        const items = Object.entries(effects).flatMap(([res, {gain, drain}]) => {
            const items = [];
            if (gain) {
                items.push(`<span style="color: var(--gainColor)">+${this.core.ui.formatNumber(gain)} ${res}/s</span>`);
            }
            if (drain) {
                items.push(`<span style="color: var(--drainColor)">-${this.core.ui.formatNumber(drain)} ${res}/s</span>`);
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
                // noinspection CssUnresolvedCustomProperty
                return `<span style="color: var(--${isGain ? 'gain' : 'drain'}Color)">${isGain ? '+' : ''}${this.core.ui.formatNumber(net)} ${res}/s</span>`;
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
        return this.getButtonDetailsWithMultiplier(result, plan.actual);
    }

    getButtonDetailsWithMultiplier(result, multiplier) {
        const costs = result.costs?.map(c => ({res: c.res, amt: c.amt * multiplier})) || [];
        const rewards = result.rewards?.map(r => ({res: r.res, amt: r.amt * multiplier})) || [];
        const effects = Object.entries(result.effects || {}).map(([res, val]) => ({
            res, val: Math.abs(val) * multiplier, type: val > 0 ? 'gain' : 'drain'
        }));
        const capChanges = Object.entries(result.capChanges || {}).map(([res, val]) => ({
            res, val: val * multiplier
        }));

        return {costs, rewards, effects, capChanges};
    }

    getBuildingButtonDetails(type) {
        const result = this.core.industry.getBuildEffects(type);
        if (!result) return null;

        const plan = this.getActionPlanDetails('build', type);
        // Show effects for the full selected increment, not just what you can afford
        const multiplier = plan.target;
        return this.getButtonDetailsWithMultiplier(result, multiplier);
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

        // Show effects for the full selected increment, but use x1 when disabled due to no buildings
        const capacity = this.core.industry.getMaxWorkers(type) - (this.core.industry.buildings[type]?.workers || 0);
        const multiplier = capacity === 0 ? 1 : plan.target;

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
            ...accumulate(details.effects, 'effect', e => `effect_${e.res}_${e.type}`),
            ...accumulate(details.capChanges, 'cap', c => `cap_${c.res}`)
        ]);
        
        const formatItem = (key, total) => {
            const [, res, type] = key.split('_');
            const isAmt = type === 'amt';
            const isDrain = type === 'drain';
            const isCost = key.startsWith('cost_');

            let html, colorClass;
            if (isCost) {
                html = `-${this.core.ui.formatNumber(total)} ${res}${isAmt ? '' : '/s'}`;
                colorClass = 'info-cost';
            } else if (key.startsWith('reward_')) {
                html = `+${this.core.ui.formatNumber(total)} ${res}`;
                colorClass = 'info-effect effect-gain';
            } else if (key.startsWith('cap_')) {
                const isPos = total >= 0;
                html = `${isPos ? '+' : ''}${this.core.ui.formatNumber(total)} ${res} cap`;
                colorClass = `info-effect effect-${isPos ? 'gain' : 'drain'}`;
            } else {
                html = `${isDrain ? '-' : '+'}${this.core.ui.formatNumber(total)} ${res}/s`;
                colorClass = `info-effect effect-${isDrain ? 'drain' : 'gain'}`;
            }
            return { html, colorClass };
        };

        const allItems = Array.from(itemMap.entries()).map(([key, total]) => ({key, total, isNeg: total < 0 || key.includes('_drain') || key.startsWith('cost_')}));
        const regular = allItems.filter(i => !i.key.startsWith('cap_')).sort((a, b) => b.isNeg - a.isNeg).map(i => formatItem(i.key, i.total));
        const caps = allItems.filter(i => i.key.startsWith('cap_')).sort((a, b) => b.isNeg - a.isNeg).map(i => formatItem(i.key, i.total));

        const joinWithColoredCommas = (items) => {
            const result = [];
            items.forEach((item, idx) => {
                result.push(`<span class="${item.colorClass}">${item.html}</span>`);
                if (idx < items.length - 1) {
                    result.push(`<span class="${item.colorClass}">, </span>`);
                }
            });
            return result.join('');
        };

        const rows = [];
        if (regular.length) rows.push(`<span class="info-regular-items">${joinWithColoredCommas(regular)}</span>`);
        if (caps.length) rows.push(`<span class="info-cap-items">${joinWithColoredCommas(caps)}</span>`);
        return rows.join('');
    }

    getBottleneckText() {
        const bottlenecks = this.core.industry.getBottleneckResources();
        return bottlenecks.join(', ') || 'input';
    }

    canBuildBuilding(type) {
        return this.getActionPlanDetails('build', type).actual > 0;
    }

    getBuildDisabledReason(type) {
        return this.core.industry.getBuildDisabledReason(type);
    }

    getDemolishDisabledReason(type) {
        return this.core.industry.getDemolishDisabledReason(type);
    }

    getHireDisabledReason(type) {
        return this.core.industry.getHireDisabledReason(type);
    }


    getFurloughDisabledReason(type) {
        return this.core.industry.getFurloughDisabledReason(type);
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
        return this.core.industry.isMultiIncrement();
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
