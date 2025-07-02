export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
        this.setupChevron();
        this.setupTheurgyButtons();
        
        this.createResourceRows();
        this.createWorkerSection();

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

        const forageBtn = theurgyContainer.querySelector("#theurgy-forage");
        if (forageBtn) {
            forageBtn.addEventListener("pointerdown", (event) =>{ if (forageBtn.disabled) return; this.handleTheurgyClick("forage", event);});
        }

        const plantBtn = theurgyContainer.querySelector("#theurgy-plant");
        if (plantBtn) {
            plantBtn.addEventListener("pointerdown", (event) => {if (plantBtn.disabled) return; this.handleTheurgyClick("plant", event)});
        }

        const harvestBtn = theurgyContainer.querySelector("#theurgy-harvest");
        if (harvestBtn) {
            harvestBtn.addEventListener("pointerdown", (event) => {if (harvestBtn.disabled) return; this.handleTheurgyClick("harvest", event)});
        }

        this.theurgyButtons = {
            forage: forageBtn,
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
                    case "forage":
                        resourceName = "seed"; 
                        amount = 1;
                        break;
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
        Object.keys(this.core.industry.resources).forEach(resource => {
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
        });
    }

    createWorkerSection() {
        this.workerbox = this.root.querySelector("#industry-workers");
        this.workerbox.classList.add('worker-cards-row');
        const jobs = [
            { key: "forager", label: "Forager", prod: [{res: "seeds", val: 0.2}], drain: [{res: "food", val: 0.1}] },
            { key: "planter", label: "Planter", prod: [{res: "crops", val: 0.2}], drain: [{res: "food", val: 0.15}, {res: "seeds", val: 0.2}] },
            { key: "harvester", label: "Harvester", prod: [{res: "food", val: 0.3}], drain: [{res: "crops", val: 0.2}] }
        ];
        this.jobCards = {};
        jobs.forEach(job => {
            const card = document.createElement("div");
            card.className = "worker-card";

            // Job name
            const title = document.createElement("div");
            title.className = "worker-card-title";
            title.textContent = job.label;
            card.appendChild(title);

            // Assign row
            const assignRow = document.createElement("div");
            assignRow.className = "worker-card-assign";
            const minusBtn = document.createElement("button");
            minusBtn.textContent = "-";
            minusBtn.addEventListener("click", () => this.core.industry.unassignWorker(job.key));
            const count = document.createElement("span");
            count.className = "worker-card-count";
            const plusBtn = document.createElement("button");
            plusBtn.textContent = "+";
            plusBtn.addEventListener("click", () => this.core.industry.assignWorker(job.key));
            assignRow.appendChild(minusBtn);
            assignRow.appendChild(count);
            assignRow.appendChild(plusBtn);
            card.appendChild(assignRow);

            // Per-worker stats
            const perRow = document.createElement("div");
            perRow.className = "worker-card-per";
            perRow.textContent = "Per worker: ";
            job.prod.forEach(p => {
                const span = document.createElement("span");
                span.className = "worker-card-prod";
                span.textContent = `+${p.val} ${p.res}`;
                perRow.appendChild(span);
            });
            job.drain.forEach(d => {
                const span = document.createElement("span");
                span.className = "worker-card-drain";
                span.textContent = `-${d.val} ${d.res}`;
                perRow.appendChild(span);
            });
            card.appendChild(perRow);

            // Total stats
            const totalRow = document.createElement("div");
            totalRow.className = "worker-card-total";
            totalRow.textContent = "Total: ";
            // Placeholders, will be filled in render
            const totalStats = document.createElement("span");
            totalStats.className = "worker-card-total-stats";
            totalRow.appendChild(totalStats);
            card.appendChild(totalRow);

            this.workerbox.appendChild(card);
            this.jobCards[job.key] = { count, minusBtn, plusBtn, totalStats, job };
        });
        this.strikeWarning = document.createElement("div");
        this.strikeWarning.className = "worker-strike-warning";
        this.strikeWarning.style.display = "none";
        this.strikeWarning.textContent = "Workers are on strike! (No food)";
        this.workerbox.appendChild(this.strikeWarning);
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

    render(data) {
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
                    rateSpan.textContent = (rateNum >= 0 ? '+' : '') + formatRate(v.rate) + '/s';
                    rateSpan.classList.toggle('positive', rateNum > 0);
                    rateSpan.classList.toggle('negative', rateNum < 0);
                }
            }
        });
        // Update workers UI
        if (this.workerCountSpan && this.workerCapSpan && data.resources.workers) {
            this.workerCountSpan.textContent = Math.floor(data.resources.workers.value);
            this.workerCapSpan.textContent = data.workerCap;
        }
        if (this.jobCards && data.workerJobs) {
            Object.entries(this.jobCards).forEach(([job, card]) => {
                const assigned = data.workerJobs[job] || 0;
                card.count.textContent = assigned;
                // Per-worker stats are static
                // Total stats:
                let totalStrs = [];
                card.job.prod.forEach(p => {
                    const total = (assigned * p.val).toFixed(2);
                    totalStrs.push(`+${total} ${p.res}`);
                });
                card.job.drain.forEach(d => {
                    const total = (assigned * d.val).toFixed(2);
                    totalStrs.push(`-${total} ${d.res}`);
                });
                card.totalStats.innerHTML = totalStrs.map(s => `<span>${s}</span>`).join(' ');
            });
        }
        if (this.strikeWarning) {
            this.strikeWarning.style.display = data.workersOnStrike ? "block" : "none";
        }
        this.updateTheurgyButtonStates();
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
