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
      
        for (let i = 0; i < count; i++) {
          const el = document.createElement('div');
          el.className = 'theurgyParticle';
      
          const size = 1.2 + Math.random() * 1.2;
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.left = `${startX}px`;
          el.style.top = `${startY}px`;
      
          document.body.appendChild(el);
      
          // Stronger upward launch
          const angle = Math.random() * 2 * Math.PI;
          const speed = 1.2 + Math.random() * 1.8;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed * 0.6
                    - (0.8 + Math.random());
      
          particles.push({ el, x: 0, y: 0, vx, vy, age: 0 });
        }
      
        function animate() {
          for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
      
            p.vx *= DRAG;
            p.vy = p.vy * DRAG + GRAVITY;
            p.x += p.vx;
            p.y += p.vy;
            p.age++;
      
            const t = p.age / LIFESPAN;
            p.el.style.opacity = 1 - t;
            p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      
            if (p.age >= LIFESPAN) {
              p.el.remove();
              particles.splice(i, 1);
            }
          }
      
          if (particles.length > 0) {
            requestAnimationFrame(animate);
          }
        }
      
        requestAnimationFrame(animate);
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
        floatingText.style.top = `${textRect.top + 4}px`;

        document.body.appendChild(floatingText);

        requestAnimationFrame(() => {
            floatingText.style.opacity = "0";
            floatingText.style.transform = `translateY(-16px)`;
        });

        setTimeout(() => {
            if (floatingText.parentNode) {
                floatingText.parentNode.removeChild(floatingText);
            }
        }, 800);
    }

    handleTheurgyClick(theurgyType, event) {
        const changes = this.core.industry.performTheurgy(theurgyType);
        const button = this.theurgyButtons[theurgyType];
        button.classList.add("nudged");
        setTimeout(() => { button.classList.remove("nudged") }, 100);

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
        this.resourcebox._rows[resource] = { nameSpan, nameText, valueSpan, rateSpan };
    }

    createProductionGrid() {
        this.prodBox = this.root.querySelector('#industry-prod');
        this.buildingCards = {};

        const workerHeader = document.createElement('div');
        workerHeader.className = 'worker-header';
        workerHeader.innerHTML = `
            <div class="worker-total">
                <span class="worker-label">Available:</span>
                <span class="worker-count" id="available-workers">0</span>
                <span class="worker-total-info" id="total-workers">(0 total)</span>
            </div>
        `;
        this.prodBox.appendChild(workerHeader);

        const buildingsContainer = document.createElement('div');
        buildingsContainer.className = 'buildings-container';

        for (const [type, b] of Object.entries(this.core.industry.buildings)) {
            const def = this.defs[type];
            const card = this.createBuildingCard(type, b, def);
            buildingsContainer.appendChild(card);
        }

        this.prodBox.appendChild(buildingsContainer);
    }

    createBuildingCard(type, building, def) {
        // Main row (keyboard-like 3D button)
        const row = document.createElement('div');
        row.className = 'building-row';

        // Main button: name + count
        const mainBtn = document.createElement('button');
        mainBtn.className = 'building-main-btn';
        mainBtn.innerHTML = `<span class="building-title">${def ? def.name : type} <span class="building-count">(${building.count})</span></span>`;
        mainBtn.onclick = () => this.core.industry.buildBuilding(type);

        // ↑ button: increase level (stub)
        const plusBtn = document.createElement('button');
        plusBtn.className = 'building-plus-btn';
        plusBtn.textContent = '↑';
        plusBtn.onclick = () => this.core.industry.levelUpBuilding(type); // stub, implement in manager
        plusBtn.disabled = (building.count === 0);

        // − button: sell building
        const minusBtn = document.createElement('button');
        minusBtn.className = 'building-minus-btn';
        minusBtn.textContent = '−';
        minusBtn.onclick = () => this.core.industry.sellBuilding(type);
        minusBtn.disabled = (building.count === 0);

        // Chevron button
        const chevronBtn = document.createElement('button');
        chevronBtn.className = 'building-chevron-btn';
        chevronBtn.innerHTML = '<span class="chevron-icon">&#x25BC;</span>';

        // Dropdown panel (hidden by default)
        const dropdown = document.createElement('div');
        dropdown.className = 'building-dropdown';
        dropdown.style.height = '0';
        dropdown.style.opacity = '0';
        dropdown.style.overflow = 'hidden';
        dropdown.style.transition = 'height 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.18s cubic-bezier(0.4,0,0.2,1)';
        dropdown.style.pointerEvents = 'none';

        // Fill dropdown with info and actions
        dropdown.innerHTML = `
            <div class="dropdown-content">
                <div class="dropdown-title">${def ? def.name : type}</div>
                <div class="dropdown-prod">${this.getBuildingProdText(def, building)}</div>
                <div class="dropdown-cost">Cost: ${def ? Object.entries(def.buildCost).map(([res, amt]) => `${amt} ${res}`).join(', ') : ''}</div>
                <button class="dropdown-sell-btn">Sell</button>
            </div>
        `;
        // Sell button logic
        dropdown.querySelector('.dropdown-sell-btn').onclick = () => this.core.industry.sellBuilding(type);

        // Chevron logic
        let open = false;
        chevronBtn.onclick = () => {
            open = !open;
            if (open) {
                dropdown.style.pointerEvents = 'auto';
                dropdown.style.opacity = '1';
                dropdown.style.height = dropdown.scrollHeight + 'px';
                chevronBtn.querySelector('.chevron-icon').style.transform = 'rotate(180deg)';
            } else {
                dropdown.style.pointerEvents = 'none';
                dropdown.style.opacity = '0';
                dropdown.style.height = '0';
                chevronBtn.querySelector('.chevron-icon').style.transform = '';
            }
        };

        // Compose row
        row.appendChild(mainBtn);
        row.appendChild(minusBtn);
        row.appendChild(plusBtn);
        row.appendChild(chevronBtn);

        // Container for row + dropdown
        const container = document.createElement('div');
        container.className = 'building-row-container';
        container.appendChild(row);
        container.appendChild(dropdown);

        // Store references for updating
        this.buildingCards[type] = {
            container,
            row,
            mainBtn,
            plusBtn,
            minusBtn,
            chevronBtn,
            dropdown,
            countSpan: mainBtn.querySelector('.building-count'),
            prodRow: dropdown.querySelector('.dropdown-prod')
        };

        return container;
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

                if (v.rate !== undefined) {
                    let rateNum = v.rate.toNumber();
                    const { nameSpan } = this.resourcebox._rows[k];

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
                card.prodRow.textContent = this.getBuildingProdText(def, b);
                card.plusBtn.disabled = (b.count === 0);
                card.minusBtn.disabled = (b.count === 0);
            }
        }
    }

    formatNumber(value, options = {}) {
        const num = typeof value === 'number' ? value : value.toNumber();
        
        if (options.format === 'scientific') {
            return num.toExponential(2);
        }
        
        if (options.format === 'detailed') {
            if (num < 1) {
                return num.toFixed(2);
            }
            if (num < 1000) {
                const intPart = Math.floor(num).toString();
                const decPart = (num % 1).toFixed(2).slice(1);
                return `${intPart}${decPart}`;
            }
            if (num < 1e6) {
                return (num / 1e3).toFixed(2).replace(/\.00$/, '') + 'k';
            }
            if (num < 1e9) {
                return (num / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
            }
            return num.toExponential(2);
        }
        
        if (num < 1000) {
            return Math.floor(num).toString();
        }
        if (num < 1e6) {
            return (num / 1e3).toFixed(2).replace(/\.00$/, '') + 'k';
        }
        if (num < 1e9) {
            return (num / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
        }
        
        return num.toExponential(2);
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
