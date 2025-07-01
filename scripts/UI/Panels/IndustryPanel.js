export default class IndustryPanel {
    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.resourcebox = this.root.querySelector("#industry-resources");
        this.resourcebox._rows = {};
        this.isExpanded = false; 

        this.setupChevron();
        this.setupTheurgyButtons();
        
        this.createResourceRows();
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
            forageBtn.addEventListener("click", (event) => this.handleTheurgyClick("forage", event));
        }

        const plantBtn = theurgyContainer.querySelector("#theurgy-plant");
        if (plantBtn) {
            plantBtn.addEventListener("click", (event) => this.handleTheurgyClick("plant", event));
        }

        const harvestBtn = theurgyContainer.querySelector("#theurgy-harvest");
        if (harvestBtn) {
            harvestBtn.addEventListener("click", (event) => this.handleTheurgyClick("harvest", event));
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

    toggleView() {
        this.isExpanded = !this.isExpanded;
        
        this.root.classList.add("transitioning");
        
        if (this.isExpanded) {
            this.root.classList.add("expanded");
        } else {
            this.root.classList.remove("expanded");
        }
        
        setTimeout(() => {
            this.root.classList.remove("transitioning");
        }, 320); // based on CSS transition duration
        
        if (this.isExpanded && this.core.industry) {
            this.render(this.core.industry.getStatus());
        }
    }

    render(data) {
        Object.entries(data.resources).forEach(([k, v]) => {
            if (this.resourcebox._rows[k]) {
                const { valueSpan, rateSpan } = this.resourcebox._rows[k];
                valueSpan.textContent = v.value;
                
                // Update rate display if in expanded view
                if (this.isExpanded && v.rate !== undefined) {
                    // Convert Decimal to number and format
                    const rateValue = parseFloat(v.rate.toString());
                    rateSpan.textContent = rateValue >= 0 ? `+${rateValue.toFixed(2)}/s` : `${rateValue.toFixed(2)}`;
                }
            }
        });

        this.updateTheurgyButtonStates();
    }

    updateVisibility(loc, panel) {
        if (loc === "center") {
            if (panel === "industry") {
                this.root.classList.add("shown");
            } else {
                this.root.classList.remove("shown");
            }
        }
    }
}
