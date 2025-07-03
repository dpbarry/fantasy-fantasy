export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.defs = this.core.industry.constructor.BUILDING_DEFS;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
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
            plantBtn.addEventListener("pointerdown", (event) => {if (plantBtn.disabled) return; this.handleTheurgyClick("plant", event)});
        }

        const harvestBtn = theurgyContainer.querySelector("#theurgy-harvest");
        if (harvestBtn) {
            harvestBtn.addEventListener("pointerdown", (event) => {if (harvestBtn.disabled) return; this.handleTheurgyClick("harvest", event)});
        }

        this.theurgyButtons = {
            plant: plantBtn,
            harvest: harvestBtn
        };
    }

    createFloatingText(button, resourceName, amount = 1, event) {
        const floatingText = document.createElement("div");
        floatingText.textContent = `+${amount} ${resourceName}`;
        floatingText.style.cssText = `
            position: fixed;
            color: var(--baseColor);
            user-select: none;
            font-size: 0.9em;
            pointer-events: none;
            z-index: 1000;
            opacity: 1;
            transform: translateY(0);
            transition: opacity 0.8s ease-out, transform 0.8s ease-out;
            white-space: nowrap;
        `;

        const startX = event.clientX;
        const startY = event.clientY;
        
        // Generate random arc trajectory
        const minAngle = 75 * Math.PI / 180; 
        const maxAngle = 105 * Math.PI / 180; 
        const angle = minAngle + Math.random() * (maxAngle - minAngle); 
        const distance = 60 + Math.random() * 40; 
        const endX = startX + Math.cos(angle) * distance;
        const endY = startY - Math.sin(angle) * distance; 
        
        floatingText.style.left = `${startX}px`;
        floatingText.style.top = `${startY}px`;

        document.body.appendChild(floatingText);

        requestAnimationFrame(() => {
            floatingText.style.opacity = "0";
            floatingText.style.transform = `translate(${endX - startX}px, ${endY - startY}px)`;
        });

        setTimeout(() => {
            if (floatingText.parentNode) {
                floatingText.parentNode.removeChild(floatingText);
            }
        }, 800);
    }

    handleTheurgyClick(theurgyType, event) {
        const success = this.core.industry.performTheurgy(theurgyType);
        
        if (success) {
            const button = this.theurgyButtons[theurgyType];
            if (button) {
                button.classList.add("nudged");
                setTimeout(() => {
                    button.classList.remove("nudged");
                }, 100);

                let resourceName = "resource";
                let amount = 1;
                
                switch (theurgyType) {
                    case "plant":
                        resourceName = "crop"; 
                        amount = 1;
                        break;
                    case "harvest":
                        resourceName = "food";
                        amount = 1;
                        break;
                }
                
                this.createFloatingText(button, resourceName, amount, event);
            }
        }
        
        this.updateTheurgyButtonStates();
    }

    updateTheurgyButtonStates() {
        if (!this.theurgyButtons) return;
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
        nameSpan.textContent = resource.replace(/\w\S*/g, txt =>
            txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
        );

        const rateSpan = document.createElement("span");
        rateSpan.classList.add("resource-rate");

        const valueSpan = document.createElement("span");
        valueSpan.classList.add("resource-value");
        valueSpan.textContent = "0";

        row.appendChild(nameSpan);
        row.appendChild(rateSpan);
        row.appendChild(valueSpan);

        this.resourcebox.appendChild(row);
        this.resourcebox._rows[resource] = { valueSpan, rateSpan };
    }

    createProductionGrid() {
        this.prodBox = this.root.querySelector('#industry-prod');
        this.prodBox.innerHTML = '';
        this.buildingCards = {};

        for (const [type, b] of Object.entries(this.core.industry.buildings)) {
            const def = this.defs[type];
            const card = document.createElement('div');
            card.className = 'building-card';
            // Name
            const name = document.createElement('div');
            name.className = 'building-name';
            name.textContent = def ? def.name : type;
            card.appendChild(name);
            // Count
            const count = document.createElement('div');
            count.className = 'building-count';
            count.textContent = `Built: ${b.count}`;
            card.appendChild(count);
            // Build button
            const buildBtn = document.createElement('button');
            buildBtn.className = 'building-build';
            buildBtn.textContent = 'Build';
            buildBtn.onclick = () => {
                this.core.industry.buildBuilding(type);
            };
            // Show cost
            const cost = document.createElement('span');
            cost.className = 'building-cost';
            cost.textContent = def ? ' (' + Object.entries(def.buildCost).map(([res, amt]) => `${amt} ${res}`).join(', ') + ')' : '';
            buildBtn.appendChild(cost);
            card.appendChild(buildBtn);
            // Worker assign/unassign
            const workerRow = document.createElement('div');
            workerRow.className = 'building-workers';
            const assignBtn = document.createElement('button');
            assignBtn.textContent = '+';
            assignBtn.onclick = () => this.core.industry.assignWorkerToBuilding(type);
            const unassignBtn = document.createElement('button');
            unassignBtn.textContent = '-';
            unassignBtn.onclick = () => this.core.industry.unassignWorkerFromBuilding(type);
            const workerCount = document.createElement('span');
            workerCount.className = 'building-worker-count';
            workerCount.textContent = b.workers;
            workerRow.appendChild(assignBtn);
            workerRow.appendChild(workerCount);
            workerRow.appendChild(unassignBtn);
            card.appendChild(workerRow);
            // Production/drain rates
            const prodRow = document.createElement('div');
            prodRow.className = 'building-prod';
            prodRow.textContent = this.getBuildingProdText(def, b);
            card.appendChild(prodRow);
            this.prodBox.appendChild(card);
            this.buildingCards[type] = { card, count, workerCount, prodRow };
        }
    }

    getBuildingProdText(def, b) {
        let lines = [];
        if (def && def.effects) {
            for (const [res, eff] of Object.entries(def.effects)) {
                let line = '';
                if (eff.base) {
                    if (eff.base.gain) line += `+${(b.count * eff.base.gain).toFixed(2)} ${res}/s`;
                    if (eff.base.drain) line += `${line ? ', ' : ''}-${(b.count * eff.base.drain).toFixed(2)} ${res}/s`;
                }
                if (eff.worker) {
                    if (eff.worker.gain) line += `${line ? ', ' : ''}+${(b.workers * eff.worker.gain).toFixed(2)} ${res}/s (workers)`;
                    if (eff.worker.drain) line += `${line ? ', ' : ''}-${(b.workers * eff.worker.drain).toFixed(2)} ${res}/s (workers)`;
                }
                if (line) lines.push(line);
            }
        }
        return lines.join(' | ');
    }

    toggleView() {
        this.isExpanded = !this.isExpanded;
        if (this.core.industry.configs) {
            this.core.industry.configs.resourceBoxExpanded = this.isExpanded;
        }
        this.resourcebox.classList.add("transitioning");
        if (this.isExpanded) {
            this.resourcebox.classList.add("expanded");
        } else {
            this.resourcebox.classList.remove("expanded");
        }
        setTimeout(() => {
            this.resourcebox.classList.remove("transitioning");
        }, 320); // based on CSS transition duration
        if (this.isExpanded && this.core.industry) {
            this.render(this.core.industry.getStatus());
        }
    }

    renderResources(data) {
        function formatValueParts(val) {
            let num = val.toNumber(); // val being Decimal
            if (num < 1) {
                const decPart = num.toFixed(2).slice(1);
                return { int: '0', dec: decPart };
            }
            if (num < 1000) {
                const intPart = Math.floor(num).toString();
                const decPart = (num % 1).toFixed(2).slice(1);
                return { int: intPart, dec: decPart };
            }
            if (num < 1e6) return { int: (num / 1e3).toFixed(2).replace(/\.00$/, '') + 'k', dec: '' };
            if (num < 1e9) return { int: (num / 1e6).toFixed(2).replace(/\.00$/, '') + 'M', dec: '' };
            return { int: num.toExponential(2), dec: '' };
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
                const { valueSpan, rateSpan } = this.resourcebox._rows[k];
                const parts = formatValueParts(v.value);
                if (this.isExpanded) {
                    valueSpan.innerHTML = `${parts.int}<span style="opacity: 0.5;font-size:0.8em;">${parts.dec}</span>`;
                } else {
                    valueSpan.textContent = parts.int;
                }
                if (this.isExpanded && v.rate !== undefined) {
                    let rateNum = v.rate.toNumber();
                    rateSpan.textContent = (rateNum >= 0 ? '+' : '') + formatRate(v.rate);
                    rateSpan.classList.toggle('positive', rateNum > 0);
                    rateSpan.classList.toggle('negative', rateNum < 0);
                }
            } else {
                this.appendResourceRow(k);
            }
        });
    }

    render(data) {
        this.renderResources(data);

        this.updateTheurgyButtonStates();

        // Update production grid
        if (this.buildingCards && data.buildings) {
            for (const [type, b] of Object.entries(data.buildings)) {
                const def = this.defs[type];
                if (this.buildingCards[type]) {
                    this.buildingCards[type].count.textContent = `Built: ${b.count}`;
                    this.buildingCards[type].workerCount.textContent = b.workers;
                    this.buildingCards[type].prodRow.textContent = this.getBuildingProdText(def, b);
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
