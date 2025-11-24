export default function createTooltipService(core, uiManager) {
    const tooltips = new Map();
    const pointerDismissHandlers = new WeakMap();
    let observer = null;
    let activeElement = null;
    let activeTooltip = null;
    let tooltipLocked = false; // Prevent premature cleanup during creation
    const createRenderInterval = uiManager.createRenderInterval.bind(uiManager);
    const destroyRenderInterval = uiManager.destroyRenderInterval.bind(uiManager);

    // Global mousemove to catch edge cases where mouseleave doesn't fire
    document.addEventListener('mousemove', (e) => {
        if (!activeElement || !activeTooltip || tooltipLocked) return;
        
        // Check if cursor is over the active element
        const rect = activeElement.getBoundingClientRect();
        const isOver = e.clientX >= rect.left && 
                      e.clientX <= rect.right && 
                      e.clientY >= rect.top && 
                      e.clientY <= rect.bottom;
        
        if (!isOver) {
            // Give a small grace period for tooltip itself
            const tipRect = activeTooltip.getBoundingClientRect();
            const isOverTip = e.clientX >= tipRect.left && 
                             e.clientX <= tipRect.right && 
                             e.clientY >= tipRect.top && 
                             e.clientY <= tipRect.bottom;
            
            if (!isOverTip) {
                destroyTooltip(activeElement);
            }
        }
    }, { passive: true });

    window.addEventListener("scroll", () => {
        cleanupAllTooltips();
    }, true);

    function cleanupAllTooltips() {
        const tips = document.querySelectorAll(".tooltip");
        tips.forEach(tip => {
            if (tip._updateInterval) {
                clearInterval(tip._updateInterval);
            }
                tip.remove();
        });
        document.querySelectorAll('[data-hastooltip="true"]').forEach(el => {
            el.dataset.hastooltip = false;
            delete el.dataset.tooltipId;
        });
        activeElement = null;
        activeTooltip = null;
    }

    function registerTip(type, cb) {
        tooltips.set(type, cb);
    }

    function getTip(el) {
        if (!el?.dataset?.tip) return '';
        const cb = tooltips.get(el.dataset.tip);
        if (!cb) {
            el.classList.remove('hastip');
            return '';
        }
        return cb(el);
    }

    function getTips(el) {
        const tips = [];
        
        if (el?.dataset?.tip) {
            const cb = tooltips.get(el.dataset.tip);
            if (cb) {
                const content = cb(el);
                if (content) tips.push({ type: el.dataset.tip, content });
            }
        }
        
        if (el?.dataset?.tip2) {
            const cb = tooltips.get(el.dataset.tip2);
            if (cb) {
                const content = cb(el);
                if (content) tips.push({ type: el.dataset.tip2, content });
            }
        }
        
        return tips;
    }

    // Initialize tooltips immediately
    (function initialize() {
        registerTip('savvy', () => `
      <p><i>Measures economic know-how.</i></p>
      <p>Each point of <span class="savvyWord term">Savvy</span> grants a +1% boost to all Production profits.</p>
      <p>Current boost: +${core.city.ruler.savvy}%</p>
    `);

        registerTip('valor', () => `
      <p><i>Measures military expertise.</i></p>
      <p>Each point of <span class="valorWord term">Valor</span> grants a +1% boost to all damage dealt by Heroes and the Army.</p>
      <p>Current boost: +${core.city.ruler.valor}%</p>
    `);

        registerTip('wisdom', () => `
      <p><i>Measures scholastic prowess.</i></p>
      <p>Each point of <span class="wisdomWord term">Wisdom</span> grants a +1% boost to all Research bonuses.</p>
      <p>Current boost: +${core.city.ruler.wisdom}%</p>
    `);
        
        // THEURGY TOOLTIPS
        registerTip('theurgy-plant', () => {
            return `<p style="color: var(--gainColor); font-weight: 500">+1 crops</p>`;
        });

        registerTip('theurgy-harvest', () => {
            const canHarvest = core.industry.canPerformTheurgy('harvest');
            if (!canHarvest) return `<p style="opacity: 0.7; font-style: italic">Requires 1 crop</p>`;
            return `<p style="color: var(--drainColor); font-weight: 500">-1 crops</p><p style="color: var(--gainColor); font-weight: 500">+1 food</p>`;
        });

        registerTip('increment-amount', () => {
            if (!core.industry || typeof core.industry.getSelectedIncrement !== 'function') {
                return '<p>Increment by 1</p>';
            }
            const inc = core.industry.getSelectedIncrement();
            if (inc === 'max') {
                return '<p>Increment by maximum</p>';
            }
            return `<p>Increment by ${inc}</p>`;
        });

        // RESOURCE TOOLTIPS
        registerTip('resource-name', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';
            
            const resObj = core.industry.resources[res];
            let capHtml = '';
            let productionHtml = '';
            
            // Add cap info if available
            const cap = resObj.effectiveCap;
            if (cap !== undefined) {
                const capVal = cap.toNumber();
                const currentVal = resObj.value.toNumber();
                const percent = ((currentVal / capVal) * 100).toFixed(1);
                
                let capStr = capVal;
                if (capVal >= 1e6) capStr = (capVal / 1e6).toFixed(2) + 'M';
                else if (capVal >= 1e3) capStr = (capVal / 1e3).toFixed(2) + 'k';
                
                capHtml = `<p style="opacity: 0.8">Cap: ${capStr} (${percent}%)</p>`;
            }
            
            let totalWorkerGain = 0;
            let totalWorkerDrain = 0;
            
            // Get breakdown by building type
            for (const [type, b] of Object.entries(core.industry.buildings)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (!def || !def.effects || !def.effects[res]) continue;
                
                const base = def.effects[res].base;
                if (base) {
                    if (base.gain && b.count > 0) {
                        const total = b.count * (base.gain.toNumber ? base.gain.toNumber() : base.gain);
                        productionHtml += `<p style="color: var(--gainColor); font-weight: 500">+${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`;
                    }
                    if (base.drain && b.count > 0) {
                        const total = b.count * (base.drain.toNumber ? base.drain.toNumber() : base.drain);
                        productionHtml += `<p style="color: var(--drainColor); font-weight: 500">-${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`;
                    }
                }
                
                const worker = def.effects[res].worker;
                if (worker && b.workers > 0) {
                    const scale = core.industry.getWorkerScalingFactor();
                    if (worker.gain) {
                        const total = b.workers * (worker.gain.toNumber ? worker.gain.toNumber() : worker.gain) * scale;
                        totalWorkerGain += total;
                    }
                    if (worker.drain) {
                        const total = b.workers * (worker.drain.toNumber ? worker.drain.toNumber() : worker.drain) * scale;
                        totalWorkerDrain += total;
                    }
                }
            }
            
            // Add combined worker effects
            if (totalWorkerGain > 0) {
                productionHtml += `<p style="color: var(--gainColor); font-weight: 500">+${totalWorkerGain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`;
            }
            if (totalWorkerDrain > 0) {
                productionHtml += `<p style="color: var(--drainColor); font-weight: 500">-${totalWorkerDrain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`;
            }
            
            if (!productionHtml) {
                productionHtml = `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }
            
            return productionHtml + capHtml;
        });
           

        registerTip('resource-rate', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';
            
            let html = '';
            let totalWorkerGain = 0;
            let totalWorkerDrain = 0;
            
            // Get breakdown by building type
            for (const [type, b] of Object.entries(core.industry.buildings)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (!def || !def.effects || !def.effects[res]) continue;
                
                const base = def.effects[res].base;
                if (base) {
                    if (base.gain && b.count > 0) {
                        const total = b.count * (base.gain.toNumber ? base.gain.toNumber() : base.gain);
                        html += `<p style="color: var(--gainColor); font-weight: 500">+${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`;
                    }
                    if (base.drain && b.count > 0) {
                        const total = b.count * (base.drain.toNumber ? base.drain.toNumber() : base.drain);
                        html += `<p style="color: var(--drainColor); font-weight: 500">-${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`;
                    }
                }
                
                const worker = def.effects[res].worker;
                if (worker && b.workers > 0) {
                    const scale = core.industry.getWorkerScalingFactor();
                    if (worker.gain) {
                        const total = b.workers * (worker.gain.toNumber ? worker.gain.toNumber() : worker.gain) * scale;
                        totalWorkerGain += total;
                    }
                    if (worker.drain) {
                        const total = b.workers * (worker.drain.toNumber ? worker.drain.toNumber() : worker.drain) * scale;
                        totalWorkerDrain += total;
                    }
                }
            }
            
            // Add combined worker effects
            if (totalWorkerGain > 0) {
                html += `<p style="color: var(--gainColor); font-weight: 500">+${totalWorkerGain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`;
            }
            if (totalWorkerDrain > 0) {
                html += `<p style="color: var(--drainColor); font-weight: 500">-${totalWorkerDrain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`;
            }
            
            if (!html) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }
            
            return html;
        });

        // BUILDING HEADER TOOLTIPS
        registerTip('building-lore', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            if (!def) return '';
            
            let html = '';
            
            if (def.lore) {
                html += `<p style="font-style: italic;">${def.lore}&nbsp;</p>`;
            }
            
            const resources = new Set();
            if (def.effects) {
                for (const [resName, eff] of Object.entries(def.effects)) {
                    if ((eff.base && (eff.base.gain || eff.base.drain)) || 
                        (eff.worker && (eff.worker.gain || eff.worker.drain))) {
                        resources.add(resName);
                    }
                }
            }
            
            if (resources.size > 0) {
                const resourceList = Array.from(resources).map(r => 
                    r.charAt(0).toUpperCase() + r.slice(1)
                ).join(', ');
                html += `<p style="opacity: 0.8; font-size: 0.9em">Affects: ${resourceList}</p>`;
            }
            
            return html;
        });

        registerTip('build-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            if (!panel || typeof panel.getBuildDisabledReason !== 'function') return '';
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const reason = panel.getBuildDisabledReason(type, def);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('demolish-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            if (!panel || typeof panel.getDemolishDisabledReason !== 'function') return '';
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const reason = panel.getDemolishDisabledReason(type, def);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('hire-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            if (!panel || typeof panel.getHireDisabledReason !== 'function') return '';
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const reason = panel.getHireDisabledReason(type, def);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('furlough-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            if (!panel || typeof panel.getFurloughDisabledReason !== 'function') return '';
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const reason = panel.getFurloughDisabledReason(type, def);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('building-effects', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b || b.count === 0) return '';
            
            const buildingName = def.name.toLowerCase();
            const sections = [];
            
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.base) continue;
                
                if (eff.base.gain) {
                    const val = (eff.base.gain.toNumber ? eff.base.gain.toNumber() : eff.base.gain);
                    const total = b.count * val;
                    sections.push(`<p style="font-weight: 500">+${val.toFixed(2)} ${res}/s/${buildingName}</p>`);
                    sections.push(`<p style="opacity: 0.7">× ${b.count} ${buildingName}${b.count !== 1 ? 's' : ''}</p>`);
                    sections.push(`<p style="color: var(--gainColor); font-weight: 600; margin-bottom: 0.5em">= +${total.toFixed(2)} ${res}/s</p>`);
                }
                if (eff.base.drain) {
                    const val = (eff.base.drain.toNumber ? eff.base.drain.toNumber() : eff.base.drain);
                    const total = b.count * val;
                    sections.push(`<p style="font-weight: 500">-${val.toFixed(2)} ${res}/s/${buildingName}</p>`);
                    sections.push(`<p style="opacity: 0.7">× ${b.count} ${buildingName}${b.count !== 1 ? 's' : ''}</p>`);
                    sections.push(`<p style="color: var(--drainColor); font-weight: 600; margin-bottom: 0.5em">= -${total.toFixed(2)} ${res}/s</p>`);
                }
            }
            
            return sections.join('').replace(/margin-bottom: 0\.5em(?=">= [+-])(?![\s\S]*margin-bottom: 0\.5em)/, '');
        });

        registerTip('worker-effects', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b || !b.workers || b.workers === 0) return '';
            
            const scale = core.industry.getWorkerScalingFactor();
            const perWorkerNet = {};
            const totalNet = {};
            
            // Collect and combine effects by resource
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.worker) continue;
                
                if (!perWorkerNet[res]) {
                    perWorkerNet[res] = 0;
                    totalNet[res] = 0;
                }
                
                if (eff.worker.gain) {
                    const val = (eff.worker.gain.toNumber ? eff.worker.gain.toNumber() : eff.worker.gain);
                    perWorkerNet[res] += val;
                    totalNet[res] += b.workers * val * scale;
                }
                if (eff.worker.drain) {
                    const val = (eff.worker.drain.toNumber ? eff.worker.drain.toNumber() : eff.worker.drain);
                    perWorkerNet[res] -= val;
                    totalNet[res] -= b.workers * val * scale;
                }
            }
            
            const perWorkerLines = [];
            const totalLines = [];
            
            for (const [res, net] of Object.entries(perWorkerNet)) {
                if (net !== 0) {
                    const sign = net > 0 ? '+' : '-';
                    perWorkerLines.push(`${sign}${Math.abs(net).toFixed(2)} ${res}/s`);
                }
            }
            
            for (const [res, net] of Object.entries(totalNet)) {
                if (net !== 0) {
                    const isGain = net > 0;
                    const sign = isGain ? '+' : '-';
                    totalLines.push(`<span style="color: var(--${isGain ? 'gain' : 'drain'}Color)">${sign}${Math.abs(net).toFixed(2)} ${res}/s</span>`);
                }
            }
            
            if (perWorkerLines.length === 0) return '';
            
            let html = `<p style="font-weight: 500">(${perWorkerLines.join(', ')})/worker</p>`;
            html += `<p style="opacity: 0.7">× ${b.workers} worker${b.workers !== 1 ? 's' : ''}`;
            if (scale < 1) {
                const bottlenecks = core.industry.getBottleneckResources();
                const bottleneckStr = bottlenecks.length > 0 ? bottlenecks.join(', ') : 'input';
                html += ` × ${(scale * 100).toFixed(0)}% <span style="font-style: italic">(limited by ${bottleneckStr})</span>`;
            }
            html += `</p>`;
            html += `<p style="font-weight: 600">= ${totalLines.join(', ')}</p>`;
            
            return html;
        });

        registerTip('time-to-next', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            if (!def || !def.buildCost) return '';
            
            const panel = core.ui.panels.industry;
            const target = panel.getPlanTarget('build', type);
            if (target <= 0) return '';
            
            const resources = core.industry.resources;
            let html = '';
            
            for (const [res, cost] of Object.entries(def.buildCost)) {
                if (!resources[res]) continue;
                
                const current = resources[res].value.toNumber();
                const costVal = panel.getValueNumber(cost);
                const requirement = costVal * target;
                const needed = requirement - current;
                
                if (needed <= 0) continue;
                
                const rate = resources[res].netGrowthRate.toNumber();
                if (rate <= 0) {
                    html += `<p style="color: var(--drainColor); font-weight: 500">${res}: <span style="opacity: 0.7">no gain</span></p>`;
                    continue;
                }
                
                const time = needed / rate;
                html += `<p style="font-weight: 500">${needed.toFixed(1)} ${res} / ${rate.toFixed(2)}/s</p>`;
                html += `<p style="color: var(--accent); margin-left: 0.5em">= ${panel.formatTime(time)}</p>`;
            }
            
            return html;
        });

        registerTip('worker-limit', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b) return '';
            
            const perBuilding = def.workersPerBuilding || 0;
            const total = perBuilding * b.count;
            const buildingName = def.name.toLowerCase();
            
            let html = `<p style="font-weight: 500">${perBuilding} worker${perBuilding !== 1 ? 's' : ''}/${buildingName}</p>`;
            html += `<p style="opacity: 0.7">× ${b.count} ${buildingName}${b.count !== 1 ? 's' : ''}</p>`;
            html += `<p style="color: var(--accent); font-weight: 600">= ${total} worker${total !== 1 ? 's' : ''}</p>`;
            
            return html;
        });

        registerTip('worker-limited', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b || !b.workers || b.workers === 0) return '';
            
            const scale = core.industry.getWorkerScalingFactor();
            if (scale >= 1) return '';
            
            const potentialByRes = {};
            
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.worker) continue;
                
                if (!potentialByRes[res]) potentialByRes[res] = 0;
                
                if (eff.worker.gain) {
                    const val = (eff.worker.gain.toNumber ? eff.worker.gain.toNumber() : eff.worker.gain);
                    const fullRate = b.workers * val;
                    potentialByRes[res] += fullRate;
                }
                if (eff.worker.drain) {
                    const val = (eff.worker.drain.toNumber ? eff.worker.drain.toNumber() : eff.worker.drain);
                    const fullRate = b.workers * val;
                    potentialByRes[res] -= fullRate;
                }
            }
            
            const potentialEffects = [];
            const negativePotential = [];
            const positivePotential = [];
            
            for (const [res, val] of Object.entries(potentialByRes)) {
                if (val !== 0) {
                    const sign = val > 0 ? '+' : '';
                    const color = val > 0 ? 'var(--gainColor)' : 'var(--drainColor)';
                    const item = `<span style="color: ${color}">${sign}${val.toFixed(2)} ${res}/s</span>`;
                    if (val < 0) {
                        negativePotential.push(item);
                    } else {
                        positivePotential.push(item);
                    }
                }
            }
            
            potentialEffects.push(...negativePotential, ...positivePotential);
            
            return `<p style="font-weight: 500">Potential: ${potentialEffects.join(', ')}</p>`;
        });

        // NAVBAR
        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            registerTip(b.dataset.tip, () => {
                return b.classList.contains("locked") ? "<i>Locked</i>" : b.firstElementChild.alt;
            });
        });

        observeTooltips();
    })();


    function showTooltip(el) {
        // If this element already has a tooltip, do nothing
        if (activeElement === el) return;
        
        // Lock to prevent mousemove interference during creation
        tooltipLocked = true;
        
        // Clean up any existing tooltip
        if (activeTooltip) {
            if (activeTooltip._updateInterval) {
                const isIncrement = activeElement?.dataset.tip?.includes('increment-amount');
                if (isIncrement) {
                    clearInterval(activeTooltip._updateInterval);
                } else {
                    core?.ui?.destroyRenderInterval(activeTooltip._updateInterval);
                }
                activeTooltip._updateInterval = null;
            }
            activeTooltip.remove();
            activeTooltip = null;
        }
        
        // Clear previous element's flag
        if (activeElement) {
            activeElement.dataset.hastooltip = false;
            delete activeElement.dataset.tooltipId;
        }
        
        activeElement = el;
        el.dataset.hastooltip = true;

        const tips = getTips(el);
        if (tips.length === 0) {
            tooltipLocked = false;
            return;
        }

        // Create tooltip boxes
        const tipBoxes = tips.map(tip => {
            const tipBox = document.createElement('div');
            tipBox.className = 'tooltip';
            tipBox.dataset.tip = tip.type;
            tipBox.style.opacity = '0';
            tipBox.innerHTML = tip.content;
            document.body.appendChild(tipBox);
            return tipBox;
        });

        const PADDING = 8, MARGIN = 3, MULTI_GAP = 4;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;

        if (tipBoxes.length === 1) {
            // Single tooltip - use existing logic
            const tipBox = tipBoxes[0];
            tipBox.dataset.owner = Math.random().toString(36);
            el.dataset.tooltipId = tipBox.dataset.owner;
            
            const tb = tipBox.getBoundingClientRect();
            const space = {
                above: r.top, below: vh - r.bottom, left: r.left, right: vw - r.right,
            };
            const horizontalBuffer = Math.max(0, (tb.width - r.width) / 2);
            const canCenterHorizontally =
                (r.left - horizontalBuffer) >= PADDING &&
                (r.right + horizontalBuffer) <= (vw - PADDING);

            let pos;
            if (space.above >= tb.height + PADDING && canCenterHorizontally) {
                pos = 'above';
            } else if (space.below >= tb.height + PADDING && canCenterHorizontally) {
                pos = 'below';
            } else if ((r.left - tb.width - MARGIN) >= PADDING) {
                pos = 'left';
            } else if ((r.right + tb.width + MARGIN) <= vw - PADDING) {
                pos = 'right';
            } else {
                pos = 'above';
            }

            tipBox.classList.add(`tooltip-${pos}`);

            let top, left;
            switch (pos) {
                case 'above':
                    top = r.top - tb.height - MARGIN;
                    left = r.left + (r.width - tb.width) / 2;
                    break;
                case 'below':
                    top = r.bottom + MARGIN;
                    left = r.left + (r.width - tb.width) / 2;
                    break;
                case 'left':
                    top = r.top + (r.height - tb.height) / 2;
                    left = r.left - tb.width - MARGIN;
                    break;
                case 'right':
                    top = r.top + (r.height - tb.height) / 2;
                    left = r.right + MARGIN;
                    break;
            }

            left = Math.max(PADDING, Math.min(left, vw - tb.width - PADDING));
            top = Math.max(PADDING, Math.min(top, vh - tb.height - PADDING));

            tipBox.style.top = `${top}px`;
            tipBox.style.left = `${left}px`;
            tipBox.style.opacity = '';

            activeTooltip = tipBox;
        } else {
            // Multiple tooltips
            const boxes = tipBoxes.map(tb => tb.getBoundingClientRect());
            const totalWidth = boxes.reduce((sum, b) => sum + b.width, 0);
            const totalHeight = boxes.reduce((sum, b) => sum + b.height, 0);
            const maxWidth = Math.max(...boxes.map(b => b.width));
            const maxHeight = Math.max(...boxes.map(b => b.height));
            
            // Determine if tooltips are "horizontal heavy" (wider than tall)
            const avgAspect = boxes.reduce((sum, b) => sum + (b.width / b.height), 0) / boxes.length;
            const stackVertically = avgAspect > 1; // If horizontal heavy, stack vertically
            
            const space = {
                above: r.top,
                below: vh - r.bottom,
                left: r.left,
                right: vw - r.right,
            };

            let pos;
            if (stackVertically) {
                // Stack vertically (most common)
                const totalStackHeight = totalHeight + MULTI_GAP * (tipBoxes.length - 1);
                if (space.above >= totalStackHeight + PADDING) {
                    pos = 'above';
                } else if (space.below >= totalStackHeight + PADDING) {
                    pos = 'below';
                } else {
                    pos = 'above'; // fallback
                }
                
                // Determine which tooltip is closest to element
                const closestIdx = pos === 'above' ? tipBoxes.length - 1 : 0;
                
                tipBoxes.forEach((tipBox, idx) => {
                    tipBox.classList.add(`tooltip-${pos}`);
                    if (idx !== closestIdx) {
                        tipBox.classList.add('tooltip-no-arrow');
                    }
                });
                
                let currentTop;
                let left = r.left + (r.width - maxWidth) / 2;
                
                if (pos === 'above') {
                    currentTop = r.top - MARGIN - totalHeight - MULTI_GAP * (tipBoxes.length - 1);
                } else {
                    currentTop = r.bottom + MARGIN;
                }
                
                tipBoxes.forEach((tipBox, idx) => {
                    const tb = boxes[idx];
                    const boxLeft = left + (maxWidth - tb.width) / 2;
                    const finalLeft = Math.max(PADDING, Math.min(boxLeft, vw - tb.width - PADDING));
                    const finalTop = Math.max(PADDING, Math.min(currentTop, vh - tb.height - PADDING));
                    
                    tipBox.style.top = `${finalTop}px`;
                    tipBox.style.left = `${finalLeft}px`;
                    tipBox.style.opacity = '';
                    
                    currentTop += tb.height + MULTI_GAP;
                });
            } else {
                // Stack horizontally (vertical heavy tooltips side by side)
                const totalStackWidth = totalWidth + MULTI_GAP * (tipBoxes.length - 1);
                if (space.left >= totalStackWidth + PADDING) {
                    pos = 'left';
                } else if (space.right >= totalStackWidth + PADDING) {
                    pos = 'right';
                } else {
                    pos = 'right'; // fallback
                }
                
                // Determine which tooltip is closest to element
                const closestIdx = pos === 'left' ? tipBoxes.length - 1 : 0;
                
                tipBoxes.forEach((tipBox, idx) => {
                    tipBox.classList.add(`tooltip-${pos}`);
                    if (idx !== closestIdx) {
                        tipBox.classList.add('tooltip-no-arrow');
                    }
                });
                
                let currentLeft;
                let top = r.top + (r.height - maxHeight) / 2;
                
                if (pos === 'left') {
                    currentLeft = r.left - MARGIN - totalWidth - MULTI_GAP * (tipBoxes.length - 1);
                } else {
                    currentLeft = r.right + MARGIN;
                }
                
                tipBoxes.forEach((tipBox, idx) => {
                    const tb = boxes[idx];
                    const boxTop = top + (maxHeight - tb.height) / 2;
                    const finalTop = Math.max(PADDING, Math.min(boxTop, vh - tb.height - PADDING));
                    const finalLeft = Math.max(PADDING, Math.min(currentLeft, vw - tb.width - PADDING));
                    
                    tipBox.style.top = `${finalTop}px`;
                    tipBox.style.left = `${finalLeft}px`;
                    tipBox.style.opacity = '';
                    
                    currentLeft += tb.width + MULTI_GAP;
                });
            }
            
            // Store reference to first tooltip (for cleanup)
            activeTooltip = tipBoxes[0];
            // Store references to other tooltips so they get cleaned up too
            activeTooltip._siblings = tipBoxes.slice(1);
        }
        
        // Unlock after tooltip is fully created
        setTimeout(() => {
            tooltipLocked = false;
        }, 25);

        // Only update tooltips for dynamic content
        const needsUpdate = el.dataset.tip && (
            el.dataset.tip.includes('resource') || 
            el.dataset.tip.includes('building-effects') || 
            el.dataset.tip.includes('worker-effects') ||
            el.dataset.tip.includes('time-to-next') ||
            el.dataset.tip.includes('disabled') ||
            el.dataset.tip.includes('increment-amount')
        ) || el.dataset.tip2 && (
            el.dataset.tip2.includes('resource') || 
            el.dataset.tip2.includes('building-effects') || 
            el.dataset.tip2.includes('worker-effects') ||
            el.dataset.tip2.includes('time-to-next') ||
            el.dataset.tip2.includes('disabled')
        );
        
        if (needsUpdate) {
            const updaterFn = () => {
                try {
                    if (!document.body.contains(activeTooltip) || activeElement !== el) {
                        if (activeTooltip._updateInterval) {
                            destroyRenderInterval(activeTooltip._updateInterval);
                            activeTooltip._updateInterval = null;
                        }
                        return;
                    }
                    
                    // Check if disabled tooltips should self-destruct
                    const hasDisabledTip = el.dataset.tip?.includes('disabled') || el.dataset.tip2?.includes('disabled');
                    if (hasDisabledTip) {
                        // Update all tooltips to check current state
                        const updatedTips = getTips(el);
                        
                        // Count how many tips we had vs how many we have now
                        const hadCount = tipBoxes.length;
                        const haveCount = updatedTips.length;
                        
                        // If a tooltip disappeared (e.g., button is no longer disabled)
                        if (haveCount < hadCount) {
                            // Clean up old tooltips
                            if (activeTooltip._updateInterval) {
                                destroyRenderInterval(activeTooltip._updateInterval);
                                activeTooltip._updateInterval = null;
                            }
                            tipBoxes.forEach(box => {
                                if (document.body.contains(box)) {
                                    box.remove();
                                }
                            });
                            
                            // If there are still tooltips to show, recreate them
                            if (haveCount > 0) {
                                activeTooltip = null;
                                activeElement = null;
                                tooltipLocked = false;
                                showTooltip(el);
                            } else {
                                // No tooltips left, fully destroy
                                activeTooltip = null;
                                if (activeElement) {
                                    activeElement.dataset.hastooltip = false;
                                    delete activeElement.dataset.tooltipId;
                                }
                                activeElement = null;
                                tooltipLocked = false;
                            }
                            return;
                        }
                        
                        // Update remaining tooltips
                        tipBoxes.forEach((tipBox, idx) => {
                            if (updatedTips[idx]) {
                                const oldContent = tipBox.innerHTML;
                                tipBox.innerHTML = updatedTips[idx].content;
                                
                                // Reposition if content changed
                                if (oldContent !== updatedTips[idx].content) {
                                    repositionTooltips(el, tipBoxes);
                                }
                            }
                        });
                    } else {
                        // Normal update for non-disabled tooltips
                        const updatedTips = getTips(el);
                        tipBoxes.forEach((tipBox, idx) => {
                            if (updatedTips[idx]) {
                                const oldContent = tipBox.innerHTML;
                                tipBox.innerHTML = updatedTips[idx].content;
                                
                                // Reposition if content changed
                                if (oldContent !== updatedTips[idx].content) {
                                    repositionTooltips(el, tipBoxes);
                                }
                            }
                        });
                    }
                } catch {
                    if (activeTooltip._updateInterval) {
                        destroyRenderInterval(activeTooltip._updateInterval);
                        activeTooltip._updateInterval = null;
                    }
                }
            };
            
            // All tooltips update on the UI render interval
            activeTooltip._updateInterval = createRenderInterval(updaterFn);
        }
    }

    function repositionTooltips(el, tipBoxes) {
        if (!el || !tipBoxes || tipBoxes.length === 0) return;
        
        const PADDING = 8, MARGIN = 3, MULTI_GAP = 3;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;

        if (tipBoxes.length === 1) {
            const tipBox = tipBoxes[0];
            const tb = tipBox.getBoundingClientRect();
            
            // Get current position class
            let pos = 'above';
            if (tipBox.classList.contains('tooltip-below')) pos = 'below';
            else if (tipBox.classList.contains('tooltip-left')) pos = 'left';
            else if (tipBox.classList.contains('tooltip-right')) pos = 'right';

            let top, left;
            switch (pos) {
                case 'above':
                    top = r.top - tb.height - MARGIN;
                    left = r.left + (r.width - tb.width) / 2;
                    break;
                case 'below':
                    top = r.bottom + MARGIN;
                    left = r.left + (r.width - tb.width) / 2;
                    break;
                case 'left':
                    top = r.top + (r.height - tb.height) / 2;
                    left = r.left - tb.width - MARGIN;
                    break;
                case 'right':
                    top = r.top + (r.height - tb.height) / 2;
                    left = r.right + MARGIN;
                    break;
            }

            left = Math.max(PADDING, Math.min(left, vw - tb.width - PADDING));
            top = Math.max(PADDING, Math.min(top, vh - tb.height - PADDING));

            tipBox.style.top = `${top}px`;
            tipBox.style.left = `${left}px`;
        }
        // Multi-tooltip repositioning would go here if needed
    }

    function destroyTooltip(el) {
        // Only destroy if this element is the active one
        if (activeElement !== el) return;
        
        tooltipLocked = false;
        
        if (activeTooltip) {
            if (activeTooltip._updateInterval) {
                clearInterval(activeTooltip._updateInterval);
                activeTooltip._updateInterval = null;
            }
            
            // Remove siblings if they exist
            if (activeTooltip._siblings) {
                activeTooltip._siblings.forEach(sibling => {
                    if (sibling && document.body.contains(sibling)) {
                        sibling.remove();
                    }
                });
            }
            
            activeTooltip.remove();
            activeTooltip = null;
        }
        
        if (activeElement) {
            activeElement.dataset.hastooltip = false;
            delete activeElement.dataset.tooltipId;
            activeElement = null;
        }
    }

    function addDismissHandlers(el, cb) {
        pointerDismissHandlers.set(el, cb);
        document.addEventListener('pointerdown', cb);
        document.addEventListener('pointerup', cb);
    }

    function removeDismissHandlers(el) {
        const cb = pointerDismissHandlers.get(el);
        if (!cb) return;
        document.removeEventListener('pointerdown', cb);
        document.removeEventListener('pointerup', cb);
        pointerDismissHandlers.delete(el);
    }

    function attach(el) {
        if (el._hastipBound) return;
        el._hastipBound = true;

        el.addEventListener('mouseenter', onMouseEnter);
        el.addEventListener('mouseleave', onMouseLeave);
        el.addEventListener('pointerdown', onPointerDown);
    }

    function detach(el) {
        if (!el._hastipBound) return;
        el._hastipBound = false;

        el.removeEventListener('mouseenter', onMouseEnter);
        el.removeEventListener('mouseleave', onMouseLeave);
        el.removeEventListener('pointerdown', onPointerDown);

        removeDismissHandlers(el);
        destroyTooltip(el);
    }

    function onMouseEnter(e) {
        showTooltip(e.currentTarget);
    }

    function onMouseLeave(e) {
        destroyTooltip(e.currentTarget);
    }

    function onPointerDown(e) {
        const el = e.currentTarget;
        if (e.pointerType === 'mouse') return;

        e.preventDefault();
        showTooltip(el);

        const dismiss = (ev) => {
            if (ev.target === el) return;
            destroyTooltip(el);
            removeDismissHandlers(el);
        };

        setTimeout(() => addDismissHandlers(el, dismiss), 0);
    }

    function observeTooltips() {
        observer = new MutationObserver(muts => {
            muts.forEach(m => {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType !== 1) return;
                        const els = n.classList?.contains('hastip') ? [n] : Array.from(n.querySelectorAll('.hastip'));
                        els.forEach(attach);
                    });

                    m.removedNodes.forEach(n => {
                        if (n.nodeType !== 1) return;
                        const els = n.classList?.contains('hastip') ? [n] : Array.from(n.querySelectorAll('.hastip'));
                        els.forEach(detach);
                    });
                } else if (m.type === 'attributes' && m.attributeName === 'class') {
                    const tgt = m.target;
                    if (tgt.classList.contains('hastip')) attach(tgt); else detach(tgt);
                }
            });
        });

        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
        });

        document.querySelectorAll('.hastip').forEach(attach);
    }


    return {
        registerTip, showTooltip, destroyTooltip, observeTooltips,
    };
}

