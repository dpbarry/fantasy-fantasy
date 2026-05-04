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
        this.lastTheurgyClick = {};
        this.theurgyThrottleMs = 125;
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

            if (absNum < 1000) {
                const formatted = num.toFixed(2);
                const parts = formatted.split('.');
                return { int: parts[0], dec: '.' + parts[1], exp: '', hasAbbrev: false };
            }

            const formatted = this.fmt(val, { decimalPlaces: 2 });
            const abbrevMatch = formatted.match(/^[+-]?[\d.]+([a-z]+)$/);
            const hasAbbrev = !!abbrevMatch;

            if (formatted.includes('e')) return { int: formatted, dec: '', exp: '', hasAbbrev: false };
            if (hasAbbrev) return { int: formatted, dec: '', exp: '', hasAbbrev: true };

            const parts = formatted.split('.');
            const intPart = parts[0];
            const decPart = parts.length > 1 ? '.' + parts[1] : '';
            return { int: intPart, dec: decPart, exp: '', hasAbbrev: false };
        };

        const formatRate = (val) => this.fmt(val, { decimalPlaces: 2 });

        const buildingStateChanged = this.hasBuildingStateChanged(data);

        Object.entries(data.resources).forEach(([k, v]) => {
            if (this.resourcebox._rows[k]) {
                const { valueSpan, rateSpan, row } = this.resourcebox._rows[k];
                const parts = formatValueParts(v.value);
                const currentVal = v.value.toNumber();
                if (this.isExpanded || window.matchMedia('(width <= 850px)').matches) {
                    if (parts.hasAbbrev || !parts.dec) {
                        valueSpan.textContent = parts.int + parts.dec + parts.exp;
                    } else {
                        valueSpan.innerHTML = `${parts.int}<span style="opacity: 0.5;font-size:0.8em;">${parts.dec}</span>${parts.exp}`;
                    }
                } else {
                    valueSpan.textContent = parts.int + parts.dec + parts.exp;
                }

                const cap = v.effectiveCap;
                let isCapped = false;
                if (cap !== undefined) {
                    const capVal = cap.toNumber();
                    const percent = Math.min(100, (currentVal / capVal) * 100);
                    row.style.setProperty('--cap-percent', percent / 100);
                    row.classList.add('has-cap');
                    isCapped = currentVal >= capVal;
                } else {
                    row.classList.remove('has-cap');
                }

                const resData = this.core.industry.getResourceEffects(k);
                const rateNum = resData ? resData.net : 0;

                const showRate = this.isExpanded || window.matchMedia('(width <= 850px)').matches;
                const prevRate = this.previousRates[k];

                if (showRate) {
                    if (!isCapped && rateNum !== 0 && prevRate !== undefined && Math.abs(rateNum - prevRate) > 0.1 && buildingStateChanged) {
                        const isIncrease = rateNum > prevRate;
                        this.createRateIndicator(rateSpan, isIncrease);
                    }

                    rateSpan.textContent = isCapped ? '+0.00' : (rateNum >= 0 ? '+' : '') + formatRate(rateNum);
                    rateSpan.classList.toggle('positive', rateNum > 0);
                    rateSpan.classList.toggle('negative', rateNum < 0);
                    if (isCapped || rateNum === 0) rateSpan.classList.remove('positive', 'negative');

                    this.previousRates[k] = rateNum;

                    const { nameSpan } = this.resourcebox._rows[k];
                    if (isCapped) {
                        nameSpan.classList.remove('gaining', 'draining');
                    } else if (rateNum > 0) {
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
                requestAnimationFrame(() => {
                    const cardEl = this.buildingCards[type]?.container;
                    if (cardEl) this.core.ui.effects?.bloomAt(cardEl, { intensity: 'medium' });
                });
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

                const buildPlan = this.core.industry.getActionPlan('build', type);
                const sellPlan = this.core.industry.getActionPlan('sell', type);
                const hirePlan = this.core.industry.getActionPlan('hire', type);
                const furloughPlan = this.core.industry.getActionPlan('furlough', type);


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
        this.resourcebox._rows[resource] = { nameSpan, nameText, valueSpan, rateSpan, row };
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
        const now = Date.now();
        const lastClick = this.lastTheurgyClick[theurgyType] || 0;
        
        if (now - lastClick < this.theurgyThrottleMs) return;
        
        this.lastTheurgyClick[theurgyType] = now;

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

        if (theurgyType === 'plant') {
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
        if (type === 'farmPlot' && action === 'assign') {
            this.core.story.dismissInfoBox('farm-plot-worker');
        }
    }

    handleResourceAction(type, def, actionFn, costKey, changeType, storyKey) {
        const result = actionFn(type);
        if (result && def?.[costKey]) {
            Object.entries(def[costKey])
                .map(([res, amt]) => ({ res, total: this.getTotalAmount(amt, result) }))
                .filter(({ total }) => total > 0)
                .forEach(({ res, total }) => this.addResourceFloater(res, { type: changeType, amt: total, res }));
        }
        if (result > 0 && storyKey) {
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

        const plan = this.core.industry.getActionPlan('build', type);
        const shouldShowTooltip = plan.actual <= 0 || (plan.actual > 0 && plan.actual < plan.target);
        if (shouldShowTooltip) {
            this.core.ui.hookTip(button, 'build');
        } else {
            this.core.ui.unhookTip(button, 'build');
        }
    }

    updateMainButton(card, type) {
        const button = card.mainBtn;
        if (!button) return;

        const titleSpan = button.querySelector('.building-title');
        if (titleSpan) {
            let incrementSpan = titleSpan.querySelector('.building-increment');
            const buildPlan = this.core.industry.getActionPlan('build', type);
            const incVal = buildPlan.selected === 'max' ? buildPlan.actual : buildPlan.target;
            if (this.core.industry.isMultiIncrement() && incVal > 1) {
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


        const buildPlan = this.core.industry.getActionPlan('build', type);
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

        const hirePlan = this.core.industry.getActionPlan('hire', type);
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
        const sellPlan = this.core.industry.getActionPlan('sell', type);
        const details = this.getDemolishButtonDetails(type);
        this.updateButtonInfoBox(button, details);

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

        const plan = this.core.industry.getActionPlan('hire', type);
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
        this.updateButtonInfoBox(button, details);

        button.dataset.buildingType = type;

        const furloughPlan = this.core.industry.getActionPlan('furlough', type);
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
            const plan = this.core.industry.getActionPlan(action, buildingType);
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
            progressFill.style.borderRight = '1px solid color-mix(in oklab, var(--surface) 35%, var(--accent))';
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
                attrs: { tips: 'worker-limited', buildingType: type }
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
        mainBtn.innerHTML = `
            <div class="build-progress-fill"></div>
            <span class="building-title">${def ? def.name : type} <span class="building-count">(${building.count})</span></span>
        `;

        const buildPlan = this.core.industry.getActionPlan('build', type);
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
        const initialHirePlan = this.core.industry.getActionPlan('hire', type);
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
        const canBuild = this.core.industry.getActionPlan('build', type).actual > 0;
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
                            <button class="raised-button dropdown-add-building-btn" data-building-type="${type}" ${!canBuild ? 'disabled' : ''} style="position: relative;">
                                <div class="build-progress-fill"></div>
                                Build
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="raised-button dropdown-sell-btn" ${!canSell ? 'disabled' : ''} data-building-type="${type}">Demolish</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getWorkersSection(type, def, b) {
        const workerCount = b.workers || 0;
        const hirePlan = this.core.industry.getActionPlan('hire', type);
        const furloughPlan = this.core.industry.getActionPlan('furlough', type);
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
                            <button class="raised-button dropdown-add-worker-btn ${!canAdd ? 'hastip' : ''}" data-building-type="${type}" ${!canAdd ? `disabled data-tips="hire"` : ''} style="position: relative;">
                                <div class="hire-progress-fill"></div>
                                <span class="hire-btn-label" style="position: relative; z-index: 1;">Hire</span>
                            </button>
                        </div>
                        <div class="button-with-info">
                            <button class="raised-button dropdown-remove-worker-btn" ${!canRemove ? 'disabled' : ''} data-building-type="${type}">Furlough</button>
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

    #sortEffects(effects) {
        const categoryOrder = { cost: 0, reward: 1, rate: 2, cap: 3 };
        const tagOrder = { input: 0, pay: 1, prod: 2 };
        return [...effects].sort((a, b) => {
            const catDiff = (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99);
            if (catDiff !== 0) return catDiff;
            if (a.category === 'rate' && b.category === 'rate') {
                return (tagOrder[a.tag] ?? 99) - (tagOrder[b.tag] ?? 99);
            }
            return 0;
        });
    }

    #effectChildren(effect, category, units, scale, effectType) {
        const traceSteps = effect?.trace?.steps || effect?.trace?.factors || [];
        const children = traceSteps.map((step) => ({
            value: step.displayValue || step.value,
            label: '',
            note: step.label || step.source || '',
            tone: 'neutral',
            children: []
        }));
        if (category === 'rate' && units > 1) {
            const unitLabel = effectType === 'base' ? 'buildings' : 'workers';
            children.push({
                value: `×${units}`,
                label: '',
                note: unitLabel,
                tone: 'neutral',
                children: []
            });
        }
        if (category === 'rate' && scale < 1) {
            children.push({
                value: `×${(scale * 100).toFixed(0)}%`,
                label: '',
                note: 'throttled',
                tone: 'neutral',
                children: []
            });
        }
        return children;
    }

    #toneFromDirection(direction) {
        return direction === 'gain' ? 'gain' : direction === 'drain' ? 'drain' : 'neutral';
    }

    #buildActionBreakdown(action, type, opts = {}) {
        const { includeResult = true, includePlanHeader = true } = opts;
        const plan = this.core.industry.getActionPlan(action, type);

        if (includePlanHeader && plan.actual <= 0) {
            return { header: this.getDisabledReason(action, type), chain: [], resultRows: [] };
        }

        if (includePlanHeader && (action === 'sell' || action === 'furlough')) {
            if (plan.actual < plan.target) {
                const actionName = action === 'sell' ? 'demolish' : 'furlough';
                return { header: `Can only ${actionName} ${plan.actual} (all)`, chain: [], resultRows: [] };
            }
            return null;
        }

        const data = this.core.industry.getCalculationSegment('action', { action, type });
        if (!data) return null;

        const { effects, scale, units, effectType } = data;
        const chain = [];
        const netRates = {};
        const sorted = this.#sortEffects(effects);

        for (const eff of sorted) {
            const { category, resource, direction, tag, baseValue, value } = eff;
            const tone = this.#toneFromDirection(direction);
            const children = this.#effectChildren(eff, category, units, scale, effectType);

            if (category === 'cost') {
                chain.push({ value: `-${this.fmt(value)}`, label: resource, note: 'cost', tone: 'drain', children });
                continue;
            }
            if (category === 'reward') {
                chain.push({ value: `+${this.fmt(value)}`, label: resource, tone: 'gain', children });
                continue;
            }
            if (category === 'cap') {
                chain.push({
                    value: `${direction === 'gain' ? '+' : '-'}${this.fmt(value)}`,
                    label: `${resource} cap`,
                    tone,
                    children
                });
                continue;
            }
            if (category === 'rate') {
                chain.push({
                    value: `${direction === 'gain' ? '+' : '-'}${this.fmt(baseValue)}`,
                    label: `${resource}/s`,
                    note: tag,
                    tone,
                    children
                });
                netRates[resource] = (netRates[resource] || 0) + (direction === 'gain' ? value * scale : -value * scale);
            }
        }

        const resultRows = includeResult
            ? Object.entries(netRates)
                .filter(([, v]) => Math.abs(v) >= 0.0001)
                .map(([res, v]) => ({
                    value: `${v >= 0 ? '+' : ''}${this.fmt(v)}`,
                    label: `${res}/s`,
                    tone: v >= 0 ? 'gain' : 'drain'
                }))
            : [];

        const isPartial = plan.actual < plan.target;
        return {
            header: includePlanHeader && isPartial ? `Can ${action} ${units}` : '',
            chain,
            resultRows
        };
    }

    formatActionTooltip(action, type) {
        return this.#buildActionBreakdown(action, type, { includeResult: true, includePlanHeader: true });
    }

    formatAggregateTooltip(type, effectType) {
        const data = this.core.industry.getCalculationSegment('aggregate', { type, effectType });
        if (!data) return null;

        const { effects, units, scale } = data;

        const sorted = this.#sortEffects(effects);
        const chain = [];
        const netByResource = {};

        for (const eff of sorted) {
            const { resource, direction, tag, baseValue, value } = eff;
            const children = this.#effectChildren(eff, 'rate', units, scale, effectType);
            const tone = this.#toneFromDirection(direction);

            chain.push({
                value: `${direction === 'gain' ? '+' : '-'}${this.fmt(baseValue)}`,
                label: `${resource}/s`,
                tone,
                note: tag,
                children
            });

            netByResource[resource] = (netByResource[resource] || 0) + (direction === 'gain' ? value : -value) * scale;
        }

        const resultRows = Object.entries(netByResource)
            .filter(([, net]) => Math.abs(net) >= 0.0001)
            .map(([res, net]) => ({
                value: `${net >= 0 ? '+' : ''}${this.fmt(net)}`,
                label: `${res}/s`,
                tone: net >= 0 ? 'gain' : 'drain'
            }));

        if (chain.length === 0) return null;

        return [{
            chain,
            resultRows
        }];
    }

    formatResourceTooltip(res) {
        const data = this.core.industry.getCalculationSegment('resource', { resource: res });
        if (!data) return null;

        const { effects, net, rawNet = net, netFactors = [], isCapped = false } = data;
        const chain = [];
        const formatRateNote = (sourceName, effectType, tag) => {
            if (!tag) return sourceName;
            if (tag === 'prod') return effectType === 'worker' ? 'workers' : sourceName;
            if (tag === 'pay' || tag === 'input') {
                return `${effectType === 'worker' ? 'worker' : sourceName} ${tag}`;
            }
            return `${sourceName} ${tag}`;
        };

        const sorted = this.#sortEffects(effects);

        for (const eff of sorted) {
            const { buildingType, effectType, direction, tag, value, scale = 1, baseTotal, trace } = eff;
            const def = this.defs[buildingType];
            const name = effectType === 'base' ? (def?.name?.toLowerCase() || buildingType) : 'workers';
            const rowValue = Math.abs(baseTotal ?? value);
            const tone = this.#toneFromDirection(direction);

            chain.push({
                value: `${direction === 'gain' ? '+' : '-'}${this.fmt(rowValue)}`,
                label: '/s',
                tone,
                note: formatRateNote(name, effectType, tag),
                children: this.#effectChildren(eff, 'rate', trace?.units ?? 1, scale, effectType)
            });
        }

        if (!chain.length) return null;

        const hasCapMultiplierStage = isCapped && rawNet > 0 && netFactors.length > 0;
        if (hasCapMultiplierStage) {
            chain.push({
                kind: 'result',
                value: `${rawNet >= 0 ? '+' : ''}${this.fmt(rawNet)}`,
                label: '/s',
                tone: rawNet >= 0 ? 'gain' : 'drain'
            });
            for (const factor of netFactors) {
                chain.push({
                    value: factor.value,
                    label: '',
                    note: factor.label,
                    tone: 'neutral',
                    children: []
                });
            }
            chain.push({
                kind: 'result',
                value: `${net >= 0 ? '+' : ''}${this.fmt(net)}`,
                label: '/s',
                tone: net >= 0 ? 'gain' : 'drain'
            });
            return { chain, resultRows: [] };
        }

        return {
            chain,
            resultRows: [{
                value: `${net >= 0 ? '+' : ''}${this.fmt(net)}`,
                label: '/s',
                tone: net >= 0 ? 'gain' : 'drain'
            }]
        };
    }

    getDisabledReason(action, type) {
        switch (action) {
            case 'build': return this.core.industry.getBuildDisabledReason(type);
            case 'sell': return this.core.industry.getDemolishDisabledReason(type);
            case 'hire': return this.core.industry.getHireDisabledReason(type);
            case 'furlough': return this.core.industry.getFurloughDisabledReason(type);
            default: return '';
        }
    }

    formatInfoBoxTooltip(action, type) {
        const breakdown = this.#buildActionBreakdown(action, type, { includeResult: false, includePlanHeader: false });
        if (!breakdown || !breakdown.chain.length) return null;
        return breakdown;
    }

    formatAggregateEffectsInline(type, effectType) {
        const data = this.core.industry.getAggregateEffects(type, effectType);
        if (!data) return null;

        const { effects, scale } = data;
        const byResource = {};
        for (const eff of effects) {
            const { resource, direction, value } = eff;
            const scaledValue = value * scale;
            byResource[resource] = (byResource[resource] || 0) + (direction === 'gain' ? scaledValue : -scaledValue);
        }

        const items = [];
        for (const [res, net] of Object.entries(byResource)) {
            if (net !== 0) {
                const color = net > 0 ? 'gainColor' : 'drainColor';
                items.push(`<span style="color: var(--${color})">${net > 0 ? '+' : ''}${this.fmt(net)} ${res}/s</span>`);
            }
        }
        return items.length ? items.join(',&nbsp;') : null;
    }

    formatActionLabel(baseText, action, type) {
        if (!this.core.industry.isMultiIncrement()) return baseText;
        const plan = this.core.industry.getActionPlan(action, type);

        let displayValue;
        if (plan.selected === 'max') {
            displayValue = plan.actual;
        } else {
            if (action === 'build' || action === 'hire') {
                if (action === 'hire') {
                    const maxWorkers = this.core.industry.getMaxWorkers(type);
                    const b = this.core.industry.buildings[type];
                    const capacity = maxWorkers - (b?.workers || 0);
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


    getAggregateBuildingEffects(type) {
        return this.formatAggregateEffectsInline(type, 'base');
    }

    getAggregateWorkerEffects(type) {
        return this.formatAggregateEffectsInline(type, 'worker');
    }

    getTimeUntilNextBuilding(type) {
        const seconds = this.core.industry.getTimeUntilNextBuilding(type);
        return seconds !== null ? this.formatTime(seconds) : null;
    }

    getButtonDetailsFromAction(action, type) {
        const plan = this.core.industry.getActionPlan(action, type);

        if ((action === 'sell' || action === 'furlough') && (plan?.limit ?? 0) <= 0) {
            return null;
        }

        const units = Math.max(1, plan?.target || 1);
        const data = this.core.industry.getActionEffects(action, type, { forceUnits: units });
        if (!data) return null;

        const { effects, scale } = data;

        const costs = effects.filter(e => e.category === 'cost').map(e => ({ res: e.resource, amt: e.value }));
        const rewards = effects.filter(e => e.category === 'reward').map(e => ({ res: e.resource, amt: e.value }));
        const caps = effects.filter(e => e.category === 'cap').map(e => ({ res: e.resource, val: e.direction === 'gain' ? e.value : -e.value }));
        const netByRes = {};
        for (const e of effects.filter(e => e.category === 'rate')) {
            const scaledValue = e.value * scale;
            netByRes[e.resource] = (netByRes[e.resource] || 0) + (e.direction === 'gain' ? scaledValue : -scaledValue);
        }
        const effectsList = Object.entries(netByRes).filter(([, net]) => net !== 0).map(([res, net]) => ({ res, val: Math.abs(net), type: net > 0 ? 'gain' : 'drain' }));

        return { costs, rewards, effects: effectsList, capChanges: caps };
    }

    getBuildingButtonDetails(type) {
        return this.getButtonDetailsFromAction('build', type);
    }

    getDemolishButtonDetails(type) {
        return this.getButtonDetailsFromAction('sell', type);
    }

    getFurloughButtonDetails(type) {
        return this.getButtonDetailsFromAction('furlough', type);
    }

    getWorkerButtonDetails(type) {
        return this.getButtonDetailsFromAction('hire', type);
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

        const allItems = Array.from(itemMap.entries()).map(([key, total]) => ({ key, total, isNeg: total < 0 || key.includes('_drain') || key.startsWith('cost_') }));
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







    getDemolishWorkerWarning(type) {
        const warning = this.core.industry.getDemolishWorkerWarning(type);
        return warning ? `⚠ Employees: ${warning.currentWorkers} → ${warning.newWorkers} (new limit)` : null;
    }

    getPlanTarget(action, type) {
        const plan = this.core.industry.getActionPlan(action, type);
        return plan.target || 0;
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

    formatResourceCapSummary(resourceKey) {
        const resource = this.core.industry.resources[resourceKey];
        if (!resource) return '';
        const cap = resource.effectiveCap;
        if (cap === undefined) return '';
        const capVal = cap.toNumber();
        const currentVal = resource.value.toNumber();
        const percent = ((currentVal / capVal) * 100).toFixed(1);
        return `<p style="opacity: 0.8; margin-top: 0.3em">Cap: ${this.fmt(capVal)} (${percent}%)</p>`;
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
        this.core.ui.effects?.embers(event.clientX, event.clientY, { count: 5 + Math.floor(Math.random() * 3) });
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

    onVisibilityChange({ activePanels, change }) {
        const { loc, panel } = change;
        const activeMainPanel = loc === "main" ? panel : activePanels.main;
        this.core.industry.updateLoops(activeMainPanel);
        if (loc === "main" || change.reason === "show") {
            this.root.classList.toggle("shown", activeMainPanel === "industry");
        }
    }

    updateVisibility(loc, panel) {
        const activeMainPanel = loc === "main" ? panel : this.core.ui.activePanels.main;
        this.core.industry.updateLoops(activeMainPanel);
        if (loc === "main") {
            this.root.classList.toggle("shown", panel === "industry");
        }
    }
}