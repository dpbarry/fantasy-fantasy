export default function createTooltipService(core, uiManager) {
    const tooltips = new Map();
    const pointerDismissHandlers = new WeakMap();
    const pendingTooltips = new WeakMap();
    const tooltipShownFromHold = new WeakMap();
    const tooltipSections = new WeakMap();
    let observer = null;
    let activeElement = null;
    let activeTooltip = null;
    let tooltipLocked = false;
    let contextMenuService = null;
    const createRenderInterval = uiManager.createRenderInterval.bind(uiManager);
    const destroyRenderInterval = uiManager.destroyRenderInterval.bind(uiManager);

    const PADDING = 8, MARGIN = 3, MULTI_GAP = 4;
    
    function getElementSection(el) {
        if (!el) return null;
        const left = document.getElementById('left');
        const center = document.getElementById('center');
        const right = document.getElementById('right');
        if (left?.contains(el)) return 'left';
        if (center?.contains(el)) return 'center';
        if (right?.contains(el)) return 'right';
        return null;
    }
    
    function checkSectionAndDismiss() {
        if (!window.matchMedia('(width <= 950px)').matches || !core.ui.visibleSection) return;
        if (activeElement && activeTooltip) {
            const tooltipSection = tooltipSections.get(activeTooltip);
            if (tooltipSection && tooltipSection !== core.ui.visibleSection) {
                destroyTooltip(activeElement);
            }
        }
    }
    
    function setContextMenuService(service) {
        contextMenuService = service;
    }

    function isPointInRect(x, y, rect) {
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    document.addEventListener('mousemove', (e) => {
        if (!activeElement || !activeTooltip || tooltipLocked) return;
        if (isPointInRect(e.clientX, e.clientY, activeElement.getBoundingClientRect())) return;
        if (!isPointInRect(e.clientX, e.clientY, activeTooltip.getBoundingClientRect())) {
            destroyTooltip(activeElement);
        }
    }, { passive: true });

    window.addEventListener("scroll", cleanupAllTooltips, true);

    function cleanupAllTooltips() {
        document.querySelectorAll(".tooltip").forEach(tip => {
            if (tip._updateInterval) clearInterval(tip._updateInterval);
                tip.remove();
        });
        document.querySelectorAll('[data-hastooltip="true"]').forEach(el => {
            const timeout = pendingTooltips.get(el);
            if (timeout) {
                clearTimeout(timeout);
                pendingTooltips.delete(el);
            }
            tooltipShownFromHold.delete(el);
            el.dataset.hastooltip = false;
            delete el.dataset.tooltipId;
        });
        activeElement = null;
        activeTooltip = null;
    }

    function registerTip(type, cb) {
        tooltips.set(type, cb);
    }

    function getTip(el, tipKey) {
        if (!el?.dataset?.[tipKey]) return '';
        const cb = tooltips.get(el.dataset[tipKey]);
        if (!cb) {
            el.classList.remove('hastip');
            return '';
        }
        return cb(el);
    }

    function getTips(el) {
        const tips = [];
        ['tip', 'tip2'].forEach(key => {
            const content = getTip(el, key);
            if (content) tips.push({ type: el.dataset[key], content });
        });
        return tips;
    }

    function needsUpdate(el) {
        const tip = el.dataset.tip || '';
        const tip2 = el.dataset.tip2 || '';
        const dynamic = ['resource', 'building-effects', 'worker-effects', 'time-to-next', 'disabled', 'increment-amount'];
        return dynamic.some(d => tip.includes(d) || tip2.includes(d));
    }

    function updateTooltipContent(tipBoxes, updatedTips) {
        let changed = false;
        tipBoxes.forEach((tipBox, idx) => {
            if (updatedTips[idx]) {
                const newContent = updatedTips[idx].content;
                if (tipBox._lastContent !== newContent) {
                    tipBox.innerHTML = newContent;
                    tipBox._lastContent = newContent;
                    changed = true;
                }
            }
        });
        return changed;
    }

    function calculatePosition(r, tb, vw, vh) {
        const space = {
            above: r.top,
            below: vh - r.bottom,
            left: r.left,
            right: vw - r.right,
        };
        const horizontalBuffer = Math.max(0, (tb.width - r.width) / 2);
        const canCenter = (r.left - horizontalBuffer) >= PADDING && (r.right + horizontalBuffer) <= (vw - PADDING);

        let pos;
        if (space.above >= tb.height + PADDING && canCenter) pos = 'above';
        else if (space.below >= tb.height + PADDING && canCenter) pos = 'below';
        else if ((r.left - tb.width - MARGIN) >= PADDING) pos = 'left';
        else if ((r.right + tb.width + MARGIN) <= vw - PADDING) pos = 'right';
        else pos = 'above';

        let top, left;
        switch (pos) {
            case 'above': top = r.top - tb.height - MARGIN; left = r.left + (r.width - tb.width) / 2; break;
            case 'below': top = r.bottom + MARGIN; left = r.left + (r.width - tb.width) / 2; break;
            case 'left': top = r.top + (r.height - tb.height) / 2; left = r.left - tb.width - MARGIN; break;
            case 'right': top = r.top + (r.height - tb.height) / 2; left = r.right + MARGIN; break;
        }

        return {
            pos,
            top: Math.max(PADDING, Math.min(top, vh - tb.height - PADDING)),
            left: Math.max(PADDING, Math.min(left, vw - tb.width - PADDING))
        };
    }

    function positionSingleTooltip(el, tipBox) {
        const r = el.getBoundingClientRect();
        const tb = tipBox.getBoundingClientRect();
        const { pos, top, left } = calculatePosition(r, tb, window.innerWidth, window.innerHeight);
        
        tipBox.classList.add(`tooltip-${pos}`);
        tipBox.style.top = `${top}px`;
        tipBox.style.left = `${left}px`;
    }

    function positionMultiTooltips(el, tipBoxes) {
        const r = el.getBoundingClientRect();
        const boxes = tipBoxes.map(tb => tb.getBoundingClientRect());
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        const totalWidth = boxes.reduce((sum, b) => sum + b.width, 0);
        const totalHeight = boxes.reduce((sum, b) => sum + b.height, 0);
        const maxWidth = Math.max(...boxes.map(b => b.width));
        const maxHeight = Math.max(...boxes.map(b => b.height));
        const avgAspect = boxes.reduce((sum, b) => sum + (b.width / b.height), 0) / boxes.length;
        const stackVertically = avgAspect > 1;
        
        const space = { above: r.top, below: vh - r.bottom, left: r.left, right: vw - r.right };
        
        let pos, closestIdx;
        if (stackVertically) {
            const totalStackHeight = totalHeight + MULTI_GAP * (tipBoxes.length - 1);
            if (space.above >= totalStackHeight + PADDING) pos = 'above';
            else if (space.below >= totalStackHeight + PADDING) pos = 'below';
            else pos = 'above';
            closestIdx = pos === 'above' ? tipBoxes.length - 1 : 0;
            
            let currentTop = pos === 'above' 
                ? r.top - MARGIN - totalHeight - MULTI_GAP * (tipBoxes.length - 1)
                : r.bottom + MARGIN;
            let left = r.left + (r.width - maxWidth) / 2;
            
            tipBoxes.forEach((tipBox, idx) => {
                tipBox.classList.add(`tooltip-${pos}`);
                if (idx !== closestIdx) tipBox.classList.add('tooltip-no-arrow');
                
                const tb = boxes[idx];
                const boxLeft = left + (maxWidth - tb.width) / 2;
                tipBox.style.top = `${Math.max(PADDING, Math.min(currentTop, vh - tb.height - PADDING))}px`;
                tipBox.style.left = `${Math.max(PADDING, Math.min(boxLeft, vw - tb.width - PADDING))}px`;
                tipBox.style.opacity = '';
                currentTop += tb.height + MULTI_GAP;
            });
        } else {
            const totalStackWidth = totalWidth + MULTI_GAP * (tipBoxes.length - 1);
            if (space.left >= totalStackWidth + PADDING) pos = 'left';
            else if (space.right >= totalStackWidth + PADDING) pos = 'right';
            else pos = 'right';
            closestIdx = pos === 'left' ? tipBoxes.length - 1 : 0;
            
            let currentLeft = pos === 'left'
                ? r.left - MARGIN - totalWidth - MULTI_GAP * (tipBoxes.length - 1)
                : r.right + MARGIN;
            let top = r.top + (r.height - maxHeight) / 2;
            
            tipBoxes.forEach((tipBox, idx) => {
                tipBox.classList.add(`tooltip-${pos}`);
                if (idx !== closestIdx) tipBox.classList.add('tooltip-no-arrow');
                
                const tb = boxes[idx];
                const boxTop = top + (maxHeight - tb.height) / 2;
                tipBox.style.top = `${Math.max(PADDING, Math.min(boxTop, vh - tb.height - PADDING))}px`;
                tipBox.style.left = `${Math.max(PADDING, Math.min(currentLeft, vw - tb.width - PADDING))}px`;
                tipBox.style.opacity = '';
                currentLeft += tb.width + MULTI_GAP;
            });
        }
    }

    function repositionTooltips(el, tipBoxes) {
        if (!el || !tipBoxes?.length) return;
        if (tipBoxes.length === 1) {
            positionSingleTooltip(el, tipBoxes[0]);
        }
    }

    function cleanupTooltip() {
        if (activeTooltip?._updateInterval) {
            const isIncrement = activeElement?.dataset.tip?.includes('increment-amount');
            if (isIncrement) clearInterval(activeTooltip._updateInterval);
            else destroyRenderInterval(activeTooltip._updateInterval);
            activeTooltip._updateInterval = null;
        }
        if (activeTooltip?._siblings) {
            activeTooltip._siblings.forEach(s => s?.remove());
        }
        activeTooltip?.remove();
        activeTooltip = null;
    }

    function showTooltip(el) {
        if (activeElement === el) return;
        
        tooltipLocked = true;
        cleanupTooltip();
        
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

        const elementSection = getElementSection(el);
        const tipBoxes = tips.map(tip => {
            const tipBox = document.createElement('div');
            tipBox.className = 'tooltip';
            tipBox.dataset.tip = tip.type;
            tipBox.style.opacity = '0';
            tipBox.innerHTML = tip.content;
            tipBox._lastContent = tip.content;
            document.body.appendChild(tipBox);
            if (elementSection) {
                tooltipSections.set(tipBox, elementSection);
            }
            return tipBox;
        });

        if (tipBoxes.length === 1) {
            const tipBox = tipBoxes[0];
            tipBox.dataset.owner = Math.random().toString(36);
            el.dataset.tooltipId = tipBox.dataset.owner;
            positionSingleTooltip(el, tipBox);
            tipBox.style.opacity = '';
            activeTooltip = tipBox;
        } else {
            positionMultiTooltips(el, tipBoxes);
            activeTooltip = tipBoxes[0];
            activeTooltip._siblings = tipBoxes.slice(1);
        }
        
        setTimeout(() => { tooltipLocked = false; }, 25);

        if (needsUpdate(el)) {
            const updaterFn = () => {
                try {
                    if (!document.body.contains(activeTooltip) || activeElement !== el) {
                        if (activeTooltip?._updateInterval) {
                            destroyRenderInterval(activeTooltip._updateInterval);
                            activeTooltip._updateInterval = null;
                        }
                        return;
                    }
                    
                    const updatedTips = getTips(el);
                    const hasDisabledTip = el.dataset.tip?.includes('disabled') || el.dataset.tip2?.includes('disabled');
                    
                    if (hasDisabledTip && updatedTips.length < tipBoxes.length) {
                        if (activeTooltip._updateInterval) {
                            destroyRenderInterval(activeTooltip._updateInterval);
                            activeTooltip._updateInterval = null;
                        }
                        tipBoxes.forEach(box => box?.remove());
                        
                        if (updatedTips.length > 0) {
                            activeTooltip = null;
                            activeElement = null;
                            tooltipLocked = false;
                            showTooltip(el);
                        } else {
                            cleanupTooltip();
                            if (activeElement) {
                                activeElement.dataset.hastooltip = false;
                                delete activeElement.dataset.tooltipId;
                            }
                            activeElement = null;
                            tooltipLocked = false;
                        }
                        return;
                    }
                    
                    if (updateTooltipContent(tipBoxes, updatedTips)) {
                        repositionTooltips(el, tipBoxes);
                    }
                } catch {
                    if (activeTooltip?._updateInterval) {
                        destroyRenderInterval(activeTooltip._updateInterval);
                        activeTooltip._updateInterval = null;
                    }
                }
            };
            
            activeTooltip._updateInterval = createRenderInterval(updaterFn);
        }
    }

    function destroyTooltip(el) {
        if (activeElement !== el) return;
        
        tooltipLocked = false;
        tooltipShownFromHold.delete(el);
        cleanupTooltip();
        
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

    function isInteractive(el) {
        if (!el) return false;
        const tag = el.tagName.toLowerCase();
        return ['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
               el.getAttribute('role') === 'button' ||
               el.onclick || el.getAttribute('onclick') ||
               el.classList.contains('button') || el.classList.contains('btn');
    }

    function attach(el) {
        if (el._hastipBound) return;
        el._hastipBound = true;
        el.addEventListener('mouseenter', onMouseEnter);
        el.addEventListener('mouseleave', onMouseLeave);
        el.addEventListener('pointerdown', onPointerDown);
        el.addEventListener('pointerup', onPointerUp);
    }

    function detach(el) {
        if (!el._hastipBound) return;
        el._hastipBound = false;
        el.removeEventListener('mouseenter', onMouseEnter);
        el.removeEventListener('mouseleave', onMouseLeave);
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointerup', onPointerUp);
        
        const timeout = pendingTooltips.get(el);
        if (timeout) {
            clearTimeout(timeout);
            pendingTooltips.delete(el);
        }
        tooltipShownFromHold.delete(el);
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

        if (activeElement === el && activeTooltip) {
            const timeout = pendingTooltips.get(el);
            if (timeout) {
                clearTimeout(timeout);
                pendingTooltips.delete(el);
            }
            destroyTooltip(el);
            return;
        }

        const existingTimeout = pendingTooltips.get(el);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            pendingTooltips.delete(el);
        }

        const delay = isInteractive(el) ? 350 : 100;
        const timeout = setTimeout(() => {
            if (pendingTooltips.get(el) !== timeout) return;
            
            pendingTooltips.delete(el);
            
            if (contextMenuService?.hasMenu(el)) {
                const rect = el.getBoundingClientRect();
                if (contextMenuService.handleHold(el, rect.left + rect.width / 2, rect.top + rect.height / 2)) {
                    tooltipShownFromHold.set(el, true);
                    return;
                }
            }
            
            tooltipShownFromHold.set(el, true);
            showTooltip(el);

            const dismiss = (ev) => {
                if (el.contains(ev.target)) return;
                destroyTooltip(el);
                removeDismissHandlers(el);
                tooltipShownFromHold.delete(el);
            };

            setTimeout(() => addDismissHandlers(el, dismiss), 0);
        }, delay);

        pendingTooltips.set(el, timeout);

        const cancelOnUp = () => {
            const timeout = pendingTooltips.get(el);
            if (timeout) {
                clearTimeout(timeout);
                pendingTooltips.delete(el);
            }
            el.removeEventListener('pointerup', cancelOnUp);
            el.removeEventListener('pointercancel', cancelOnUp);
        };

        el.addEventListener('pointerup', cancelOnUp, { once: true });
        el.addEventListener('pointercancel', cancelOnUp, { once: true });
    }

    function onPointerUp(e) {
        const el = e.currentTarget;
        if (e.pointerType === 'mouse') return;

        if (tooltipShownFromHold.get(el)) {
            e.preventDefault();
            e.stopPropagation();
            tooltipShownFromHold.delete(el);
        } else if (contextMenuService?.wasShownFromHold(el)) {
            e.preventDefault();
            e.stopPropagation();
            contextMenuService.clearHoldFlag(el);
        }
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
                    if (tgt.classList.contains('hastip')) attach(tgt);
                    else detach(tgt);
                }
            });
        });

        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
        });

        document.querySelectorAll('.hastip').forEach(attach);
    }

    // Initialize tooltips
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
        
        registerTip('theurgy-plant', () => `<p style="color: var(--gainColor); font-weight: 500">+1 crops</p>`);

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

        registerTip('resource-name', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';
            
            const resObj = core.industry.resources[res];
            let capHtml = '';
            let totalWorkerGain = 0;
            let totalWorkerDrain = 0;
            
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
            
            for (const [type, b] of Object.entries(core.industry.buildings)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (!def?.effects?.[res]) continue;
                
                const base = def.effects[res].base;
                if (base) {
                    if (base.gain && b.count > 0) {
                        const total = b.count * (base.gain.toNumber ? base.gain.toNumber() : base.gain);
                        totalWorkerGain += total;
                    }
                    if (base.drain && b.count > 0) {
                        const total = b.count * (base.drain.toNumber ? base.drain.toNumber() : base.drain);
                        totalWorkerDrain += total;
                    }
                }
                
                const worker = def.effects[res].worker;
                if (worker && b.workers > 0) {
                    const scale = core.industry.getWorkerScalingFactor();
                    if (worker.gain) {
                        totalWorkerGain += b.workers * (worker.gain.toNumber ? worker.gain.toNumber() : worker.gain) * scale;
                    }
                    if (worker.drain) {
                        totalWorkerDrain += b.workers * (worker.drain.toNumber ? worker.drain.toNumber() : worker.drain) * scale;
                    }
                }
            }
            
            if (totalWorkerGain === 0 && totalWorkerDrain === 0) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>` + capHtml;
            }
            
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;
            let totalGain = 0;
            let totalDrain = 0;
            const gainFactors = [];
            const drainFactors = [];
            
            for (const [type, b] of Object.entries(core.industry.buildings)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (!def?.effects?.[res]) continue;
                const base = def.effects[res].base;
                if (base) {
                    if (base.gain && b.count > 0) {
                        const val = (base.gain.toNumber ? base.gain.toNumber() : base.gain);
                        const total = b.count * val;
                        totalGain += total;
                        gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`);
                    }
                    if (base.drain && b.count > 0) {
                        const val = (base.drain.toNumber ? base.drain.toNumber() : base.drain);
                        const total = b.count * val;
                        totalDrain += total;
                        drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`);
                    }
                }
            }
            
            totalGain += totalWorkerGain;
            totalDrain += totalWorkerDrain;
            if (totalWorkerGain > 0) {
                gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${totalWorkerGain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`);
            }
            if (totalWorkerDrain > 0) {
                drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${totalWorkerDrain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`);
            }
            
            const factors = [...gainFactors];
            if (wisdom > 0 && gainFactors.length > 0) {
                factors.push(`<p style="font-weight: 500">× ${wisdomMult.toFixed(2)} <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(wisdom)</span></p>`);
            }
            factors.push(...drainFactors);
            
            const totalRate = totalGain * wisdomMult - totalDrain;
            const sign = totalRate >= 0 ? '+' : '';
            const color = totalRate >= 0 ? 'var(--gainColor)' : 'var(--drainColor)';
            const resultHtml = `<p style="margin-top: 0.3em; padding-top: 0.3em; border-top: 1px solid var(--midBaseColor); color: ${color}; font-weight: 600">= ${sign}${Math.abs(totalRate).toFixed(2)}/s</p>`;
            
            return factors.join('') + resultHtml + capHtml;
        });

        registerTip('resource-rate', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';
            
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;
            let totalGain = 0;
            let totalDrain = 0;
            let workerGain = 0;
            let workerDrain = 0;
            const gainFactors = [];
            const drainFactors = [];
            
            for (const [type, b] of Object.entries(core.industry.buildings)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (!def?.effects?.[res]) continue;
                
                const base = def.effects[res].base;
                if (base) {
                    if (base.gain && b.count > 0) {
                        const val = (base.gain.toNumber ? base.gain.toNumber() : base.gain);
                        const total = b.count * val;
                        totalGain += total;
                        gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`);
                    }
                    if (base.drain && b.count > 0) {
                        const val = (base.drain.toNumber ? base.drain.toNumber() : base.drain);
                        const total = b.count * val;
                        totalDrain += total;
                        drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${total.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(${def.name.toLowerCase()})</span></p>`);
                    }
                }
                
                const worker = def.effects[res].worker;
                if (worker && b.workers > 0) {
                    const scale = core.industry.getWorkerScalingFactor();
                    if (worker.gain) {
                        const val = (worker.gain.toNumber ? worker.gain.toNumber() : worker.gain);
                        const total = b.workers * val * scale;
                        workerGain += total;
                        totalGain += total;
                    }
                    if (worker.drain) {
                        const val = (worker.drain.toNumber ? worker.drain.toNumber() : worker.drain);
                        const total = b.workers * val * scale;
                        workerDrain += total;
                        totalDrain += total;
                    }
                }
            }
            
            if (workerGain > 0) {
                gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${workerGain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`);
            }
            if (workerDrain > 0) {
                drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${workerDrain.toFixed(2)}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(workers)</span></p>`);
            }
            
            if (gainFactors.length === 0 && drainFactors.length === 0) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }
            
            const factors = [...gainFactors];
            if (wisdom > 0 && gainFactors.length > 0) {
                factors.push(`<p style="font-weight: 500">× ${wisdomMult.toFixed(2)} <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(wisdom)</span></p>`);
            }
            factors.push(...drainFactors);
            
            const totalRate = totalGain * wisdomMult - totalDrain;
            const sign = totalRate >= 0 ? '+' : '';
            const color = totalRate >= 0 ? 'var(--gainColor)' : 'var(--drainColor)';
            const resultHtml = `<p style="margin-top: 0.3em; padding-top: 0.3em; border-top: 1px solid var(--midBaseColor); color: ${color}; font-weight: 600">= ${sign}${Math.abs(totalRate).toFixed(2)}/s</p>`;
            
            return factors.join('') + resultHtml;
        });

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
            const reason = panel.getBuildDisabledReason(type, core.industry.constructor.BUILDING_DEFS[type]);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('demolish-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const reason = panel.getDemolishDisabledReason(type);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('demolish-warning', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const warning = panel.getDemolishWorkerWarning(type);
            return warning ? `<p>${warning}</p>` : '';
        });

        registerTip('hire-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const reason = panel.getHireDisabledReason(type);
            return reason ? `<p>${reason}</p>` : '';
        });

        registerTip('furlough-disabled', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const reason = panel.getFurloughDisabledReason(type);
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
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;
            
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.base) continue;
                
                const gainFactors = [];
                const drainFactors = [];
                let baseGain = 0;
                let baseDrain = 0;
                
                if (eff.base.gain) {
                    const val = (eff.base.gain.toNumber ? eff.base.gain.toNumber() : eff.base.gain);
                    baseGain = val;
                    gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${val.toFixed(2)} ${res}/s</p>`);
                }
                if (eff.base.drain) {
                    const val = (eff.base.drain.toNumber ? eff.base.drain.toNumber() : eff.base.drain);
                    baseDrain = val;
                    drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${val.toFixed(2)} ${res}/s</p>`);
                }
                
                const factors = [...gainFactors];
                if (wisdom > 0 && gainFactors.length > 0) {
                    factors.push(`<p style="font-weight: 500">× ${wisdomMult.toFixed(2)} <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(wisdom)</span></p>`);
                }
                factors.push(...drainFactors);
                factors.push(`<p style="opacity: 0.7">× ${b.count} ${buildingName}${b.count !== 1 ? 's' : ''}</p>`);
                
                const finalTotal = (baseGain * wisdomMult - baseDrain) * b.count;
                const sign = finalTotal >= 0 ? '+' : '';
                const color = finalTotal >= 0 ? 'var(--gainColor)' : 'var(--drainColor)';
                
                sections.push(factors.join(''));
                sections.push(`<p style="margin-top: 0.3em; padding-top: 0.3em; border-top: 1px solid var(--midBaseColor); color: ${color}; font-weight: 600">= ${sign}${Math.abs(finalTotal).toFixed(2)} ${res}/s</p>`);
            }
            
            return sections.join('');
        });

        registerTip('worker-effects', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b || !b.workers || b.workers === 0) return '';
            
            const scale = core.industry.getWorkerScalingFactor();
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;
            
            const perWorkerGain = {};
            const perWorkerDrain = {};
            const totalGain = {};
            const totalDrain = {};
            
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.worker) continue;
                
                if (eff.worker.gain) {
                    const val = (eff.worker.gain.toNumber ? eff.worker.gain.toNumber() : eff.worker.gain);
                    perWorkerGain[res] = (perWorkerGain[res] || 0) + val;
                    totalGain[res] = (totalGain[res] || 0) + b.workers * val * scale;
                }
                if (eff.worker.drain) {
                    const val = (eff.worker.drain.toNumber ? eff.worker.drain.toNumber() : eff.worker.drain);
                    perWorkerDrain[res] = (perWorkerDrain[res] || 0) + val;
                    totalDrain[res] = (totalDrain[res] || 0) + b.workers * val * scale;
                }
            }
            
            if (Object.keys(perWorkerGain).length === 0 && Object.keys(perWorkerDrain).length === 0) return '';
            
            const gainFactors = [];
            const drainFactors = [];
            
            for (const [res, val] of Object.entries(perWorkerGain)) {
                gainFactors.push(`<p style="color: var(--gainColor); font-weight: 500">+${val.toFixed(2)} ${res}/s</p>`);
            }
            
            for (const [res, val] of Object.entries(perWorkerDrain)) {
                if (!perWorkerGain[res]) {
                    drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${val.toFixed(2)} ${res}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(input)</span></p>`);
                }
            }
            
            for (const [res, val] of Object.entries(perWorkerDrain)) {
                if (perWorkerGain[res]) {
                    drainFactors.push(`<p style="color: var(--drainColor); font-weight: 500">-${val.toFixed(2)} ${res}/s <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(pay)</span></p>`);
                }
            }
            
            const factors = [...gainFactors];
            if (wisdom > 0 && gainFactors.length > 0) {
                factors.push(`<p style="font-weight: 500">× ${wisdomMult.toFixed(2)} <span style="opacity: 0.7; font-weight: 400; color: var(--baseColor) !important">(wisdom)</span></p>`);
            }
            factors.push(...drainFactors);
            
            factors.push(`<p style="opacity: 0.7">× ${b.workers} worker${b.workers !== 1 ? 's' : ''}`);
            if (scale < 1) {
                const bottlenecks = core.industry.getBottleneckResources();
                const bottleneckStr = bottlenecks.length > 0 ? bottlenecks.join(', ') : 'input';
                factors[factors.length - 1] += ` × ${(scale * 100).toFixed(0)}% <span style="font-style: italic">(limited by ${bottleneckStr})</span>`;
            }
            factors[factors.length - 1] += `</p>`;
            
            const finalResults = {};
            for (const [res, gain] of Object.entries(totalGain)) {
                finalResults[res] = (finalResults[res] || 0) + gain * wisdomMult;
            }
            for (const [res, drain] of Object.entries(totalDrain)) {
                finalResults[res] = (finalResults[res] || 0) - drain;
            }
            
            const finalLines = [];
            for (const [res, net] of Object.entries(finalResults)) {
                if (net !== 0) {
                    const isGain = net > 0;
                    finalLines.push(`<span style="color: var(--${isGain ? 'gain' : 'drain'}Color)">${isGain ? '+' : ''}${Math.abs(net).toFixed(2)} ${res}/s</span>`);
                }
            }
            
            const resultHtml = `<p style="margin-top: 0.3em; padding-top: 0.3em; border-top: 1px solid var(--midBaseColor); font-weight: 600">= ${finalLines.join(', ')}</p>`;
            
            return factors.join('') + resultHtml;
        });

        registerTip('time-to-next', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            
            const def = core.industry.constructor.BUILDING_DEFS[type];
            if (!def?.buildCost) return '';
            
            const panel = core.ui.panels.industry;
            const target = panel.getPlanTarget('build', type);
            if (target <= 0) return '';
            
            const resources = core.industry.resources;
            let html = '';
            
            for (const [res, cost] of Object.entries(def.buildCost)) {
                if (!resources[res]) continue;
                
                const current = resources[res].value.toNumber();
                const costVal = panel.getValueNumber(cost);
                const needed = costVal * target - current;
                
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
            
            const currentEffects = core.industry.getAggregateWorkerEffects(type);
            if (!currentEffects) return '';
            
            const potentialByRes = {};
            for (const [res, net] of Object.entries(currentEffects)) {
                if (scale > 0) potentialByRes[res] = net / scale;
            }
            
            const negativePotential = [];
            const positivePotential = [];
            
            for (const [res, val] of Object.entries(potentialByRes)) {
                if (val !== 0) {
                    const sign = val > 0 ? '+' : '';
                    const color = val > 0 ? 'var(--gainColor)' : 'var(--drainColor)';
                    const item = `<span style="color: ${color}">${sign}${Math.abs(val).toFixed(2)} ${res}/s</span>`;
                    (val < 0 ? negativePotential : positivePotential).push(item);
                }
            }
            
            const potentialEffects = [...negativePotential, ...positivePotential];
            return potentialEffects.length > 0 ? `<p style="font-weight: 500">Potential: ${potentialEffects.join(', ')}</p>` : '';
        });

        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            registerTip(b.dataset.tip, () => {
                return b.classList.contains("locked") ? "<i>Locked</i>" : b.firstElementChild.alt;
            });
        });

        observeTooltips();
    })();

    return {
        registerTip, showTooltip, destroyTooltip, observeTooltips, setContextMenuService,
        checkSectionAndDismiss
    };
}
