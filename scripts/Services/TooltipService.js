import { formatNumber } from "../Utils.js";
import createBreakdownBox from "../UI/Components/BreakdownBox.js";

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



    let tooltipHideTimeout = null;

    document.addEventListener('mousemove', (e) => {
        // Check if mouse is over any tooltip element
        const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
        const tooltipElement = elementAtPoint?.closest('[data-tips]');
        const hasTips = tooltipElement && getTips(tooltipElement).length > 0;

        if (hasTips && tooltipElement !== activeElement) {
            // Mouse is over a different tooltip element, switch to it
            if (activeElement) {
                destroyTooltip(activeElement);
            }
            setTimeout(() => showTooltip(tooltipElement), 0);
            if (tooltipHideTimeout) {
                clearTimeout(tooltipHideTimeout);
                tooltipHideTimeout = null;
            }
            return;
        }

        if (!activeElement || !activeTooltip || tooltipLocked) return;

        if (isPointInRect(e.clientX, e.clientY, activeElement.getBoundingClientRect())) {
            // Mouse is still over the element, cancel any pending hide
            if (tooltipHideTimeout) {
                clearTimeout(tooltipHideTimeout);
                tooltipHideTimeout = null;
            }
            return;
        }

        if (!isPointInRect(e.clientX, e.clientY, activeTooltip.getBoundingClientRect())) {
            // Mouse left both element and tooltip area, start hide timeout
            if (tooltipHideTimeout) clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = setTimeout(() => {
                tooltipHideTimeout = null;
                // Double-check if mouse is still not over any tooltip element
                const currentElementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
                const currentTooltipElement = currentElementAtPoint?.closest('[data-tips]');
                if (!currentTooltipElement || !getTips(currentTooltipElement).length) {
                    destroyTooltip(activeElement);
                }
            }, 50);
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
        if (!tipKey) return '';
        const cb = tooltips.get(tipKey);
        if (!cb) return '';
        return cb(el);
    }

    function getTipKeys(el) {
        const tips = el.dataset.tips || '';
        return tips.split('@').filter(Boolean);
    }

    function getTips(el) {
        const tips = [];
        for (const key of getTipKeys(el)) {
            const content = getTip(el, key);
            if (content) tips.push({ type: key, content });
        }
        return tips;
    }

    function needsUpdate(el) {
        const tipKeys = getTipKeys(el);
        const dynamic = ['resource', 'building-effects', 'worker-effects', 'time-to-next', 'disabled', 'increment-amount', 'partial'];
        return tipKeys.some(k => dynamic.some(d => k.includes(d)));
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
            const tipKeys = activeElement ? getTipKeys(activeElement) : [];
            const isIncrement = tipKeys.some(k => k.includes('increment-amount'));
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
                    const tipKeys = getTipKeys(el);
                    const hasDisabledTip = tipKeys.some(k => k.includes('disabled'));
                    
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

        const delay = isInteractive(el) ? 900 : 350;
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

        registerTip('increment-amount', (el) => {
            if (!core.industry || typeof core.industry.getSelectedIncrement !== 'function') {
                return '<p>Increment by 1</p>';
            }
            const inc = core.industry.getSelectedIncrement();
            if (inc === 'max') {
                return '<p>Increment by maximum</p>';
            }

            const activeCard = document.querySelector('.building-card.expanded');
            if (!activeCard) return `<p>Increment by ${inc}</p>`;

            const type = activeCard.dataset.buildingType;
            if (!type) return `<p>Increment by ${inc}</p>`;

            const result = core.industry.getBuildEffectsForIncrement(type, inc);
            if (!result?.effects) return `<p>Increment by ${inc}</p>`;

            const sections = [];
            const formatType = core.settings.configs.numformat;
            for (const [res, val] of Object.entries(result.effects)) {
                if (val !== 0) {
                    const sign = val >= 0 ? '+' : '';
                    const color = val >= 0 ? 'var(--gainColor)' : 'var(--drainColor)';
                    sections.push(`<span style="color: ${color}">${sign}${formatNumber(Math.abs(val), formatType)} ${res}/s</span>`);
                }
            }

            const effectsStr = sections.length > 0 ? ` (${sections.join(', ')})` : '';
            return `<p>Increment by ${inc}${effectsStr}</p>`;
        });

        registerTip('resource-name', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';
            
            const resObj = core.industry.resources[res];
            const fmt = core.settings.configs.numformat;
            let capHtml = '';
            
            const cap = resObj.effectiveCap;
            if (cap !== undefined) {
                const capVal = cap.toNumber();
                const currentVal = resObj.value.toNumber();
                const percent = ((currentVal / capVal) * 100).toFixed(1);
                capHtml = `<p style="opacity: 0.8; margin-top: 0.3em">Cap: ${formatNumber(capVal, fmt)} (${percent}%)</p>`;
            }
            
            const breakdown = core.industry.getResourceProductionBreakdown(res);
            if (!breakdown || (breakdown.baseGain === 0 && breakdown.baseDrain === 0 && breakdown.workerGain === 0 && breakdown.workerDrain === 0)) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>` + capHtml;
            }

            const items = [];
            for (const [type, data] of Object.entries(breakdown.byBuilding)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (data.baseGain > 0) {
                    items.push({ value: `+${formatNumber(data.baseGain, fmt)}`, label: '/s', type: 'gain', note: def.name.toLowerCase() });
                }
                if (data.baseDrain > 0) {
                    items.push({ value: `-${formatNumber(data.baseDrain, fmt)}`, label: '/s', type: 'drain', note: def.name.toLowerCase() });
                }
            }
            if (breakdown.workerGain > 0) {
                items.push({ value: `+${formatNumber(breakdown.workerGain, fmt)}`, label: '/s', type: 'gain', note: 'workers' });
            }
            if (breakdown.workerDrain > 0) {
                items.push({ value: `-${formatNumber(breakdown.workerDrain, fmt)}`, label: '/s', type: 'drain', note: 'workers' });
            }

            const totalRate = breakdown.baseGain + breakdown.workerGain - breakdown.baseDrain - breakdown.workerDrain;
            const resultItems = [{
                value: `${totalRate >= 0 ? '+' : ''}${formatNumber(totalRate, fmt)}`,
                label: '/s',
                type: totalRate >= 0 ? 'gain' : 'drain'
            }];

            return createBreakdownBox({ items, modifiers: [], result: { items: resultItems } }) + capHtml;
        });

        registerTip('resource-rate', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';

            const breakdown = core.industry.getResourceProductionBreakdown(res);
            if (!breakdown || (breakdown.baseGain === 0 && breakdown.baseDrain === 0 && breakdown.workerGain === 0 && breakdown.workerDrain === 0)) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }

            const fmt = core.settings.configs.numformat;
            const items = [];

            for (const [type, data] of Object.entries(breakdown.byBuilding)) {
                const def = core.industry.constructor.BUILDING_DEFS[type];
                if (data.baseGain > 0) {
                    items.push({ value: `+${formatNumber(data.baseGain, fmt)}`, label: '/s', type: 'gain', note: def.name.toLowerCase() });
                }
                if (data.baseDrain > 0) {
                    items.push({ value: `-${formatNumber(data.baseDrain, fmt)}`, label: '/s', type: 'drain', note: def.name.toLowerCase() });
                }
            }
            if (breakdown.workerGain > 0) {
                items.push({ value: `+${formatNumber(breakdown.workerGain, fmt)}`, label: '/s', type: 'gain', note: 'workers' });
            }
            if (breakdown.workerDrain > 0) {
                items.push({ value: `-${formatNumber(breakdown.workerDrain, fmt)}`, label: '/s', type: 'drain', note: 'workers' });
            }

            if (!items.length) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }

            const totalRate = breakdown.baseGain + breakdown.workerGain - breakdown.baseDrain - breakdown.workerDrain;
            const resultItems = [{
                value: `${totalRate >= 0 ? '+' : ''}${formatNumber(totalRate, fmt)}`,
                label: '/s',
                type: totalRate >= 0 ? 'gain' : 'drain'
            }];

            return createBreakdownBox({ items, modifiers: [], result: { items: resultItems } });
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

        registerTip('build-partial', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const text = panel.getBuildPartialText(type);
            return text ? `<p>${text}</p>` : '';
        });

        registerTip('hire-partial', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const text = panel.getHirePartialText(type);
            return text ? `<p>${text}</p>` : '';
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
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;
            const fmt = core.settings.configs.numformat;

            const sections = [];
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.base) continue;

                const items = [];
                const gainItems = [];
                let baseGain = 0, baseDrain = 0;

                if (eff.base.gain) {
                    baseGain = eff.base.gain.toNumber?.() ?? eff.base.gain;
                    gainItems.push({ value: `+${formatNumber(baseGain, fmt)}`, label: `${res}/s`, type: 'gain' });
                }
                items.push(...gainItems);

                if (eff.base.drain) {
                    baseDrain = eff.base.drain.toNumber?.() ?? eff.base.drain;
                    items.push({ value: `-${formatNumber(baseDrain, fmt)}`, label: `${res}/s`, type: 'drain' });
                }

                const mods = [];
                if (wisdom > 0 && gainItems.length > 0) {
                    mods.push({ value: `×${formatNumber(wisdomMult, fmt)}`, label: 'wisdom', range: [0, gainItems.length - 1] });
                }
                mods.push({ value: '×', label: `${b.count} ${buildingName}${b.count !== 1 ? 's' : ''}`, range: [0, items.length - 1] });

                const finalTotal = (baseGain * wisdomMult - baseDrain) * b.count;
                const resultItems = [{
                    value: `${finalTotal >= 0 ? '+' : ''}${formatNumber(finalTotal, fmt)}`,
                    label: `${res}/s`,
                    type: finalTotal >= 0 ? 'gain' : 'drain'
                }];

                sections.push(createBreakdownBox({ items, modifiers: mods, result: { items: resultItems } }));
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
            const fmt = core.settings.configs.numformat;

            const gains = {}, drains = {};
            for (const [res, eff] of Object.entries(def.effects)) {
                if (!eff.worker) continue;
                if (eff.worker.gain) {
                    const v = eff.worker.gain.toNumber?.() ?? eff.worker.gain;
                    gains[res] = (gains[res] || 0) + v;
                }
                if (eff.worker.drain) {
                    const v = eff.worker.drain.toNumber?.() ?? eff.worker.drain;
                    drains[res] = (drains[res] || 0) + v;
                }
            }

            if (!Object.keys(gains).length && !Object.keys(drains).length) return '';

            const items = [];
            const gainItems = [];
            for (const [res, v] of Object.entries(gains)) {
                gainItems.push({ value: `+${formatNumber(v, fmt)}`, label: `${res}/s`, type: 'gain' });
            }
            items.push(...gainItems);

            for (const [res, v] of Object.entries(drains)) {
                const note = gains[res] ? 'pay' : 'input';
                items.push({ value: `-${formatNumber(v, fmt)}`, label: `${res}/s`, type: 'drain', note });
            }

            const mods = [];
            let modIdx = 0;
            if (wisdom > 0 && gainItems.length > 0) {
                mods.push({ value: `×${formatNumber(wisdomMult, fmt)}`, label: 'wisdom', range: [0, gainItems.length - 1] });
                modIdx++;
            }

            let workersLabel = `${b.workers} worker${b.workers !== 1 ? 's' : ''}`;
            if (scale < 1) {
                const bottlenecks = core.industry.getBottleneckResources();
                workersLabel += ` × ${(scale * 100).toFixed(0)}%`;
            }
            mods.push({ value: '×', label: workersLabel, range: [0, items.length - 1] });

            const finals = {};
            for (const [res, v] of Object.entries(gains)) {
                finals[res] = (finals[res] || 0) + v * wisdomMult * b.workers * scale;
            }
            for (const [res, v] of Object.entries(drains)) {
                finals[res] = (finals[res] || 0) - v * b.workers * scale;
            }

            const resultItems = Object.entries(finals)
                .filter(([, v]) => v !== 0)
                .map(([res, v]) => ({
                    value: `${v > 0 ? '+' : ''}${formatNumber(v, fmt)}`,
                    label: `${res}/s`,
                    type: v > 0 ? 'gain' : 'drain'
                }));

            return createBreakdownBox({ items, modifiers: mods, result: { items: resultItems } });
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
            const formatType = core.settings.configs.numformat;
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
                html += `<p style="font-weight: 500">${formatNumber(needed, formatType)} ${res} / ${formatNumber(rate, formatType)}/s</p>`;
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
            const formatType = core.settings.configs.numformat;

            for (const [res, val] of Object.entries(potentialByRes)) {
                if (val !== 0) {
                    const sign = val > 0 ? '+' : '';
                    const color = val > 0 ? 'var(--gainColor)' : 'var(--drainColor)';
                    const item = `<span style="color: ${color}">${sign}${formatNumber(Math.abs(val), formatType)} ${res}/s</span>`;
                    (val < 0 ? negativePotential : positivePotential).push(item);
                }
            }

            const potentialEffects = [...negativePotential, ...positivePotential];
            return potentialEffects.length > 0 ? `<p style="font-weight: 500">Potential: ${potentialEffects.join(', ')}</p>` : '';
        });

        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            const tipKey = getTipKeys(b)[0];
            if (tipKey) {
                registerTip(tipKey, () => {
                    return b.classList.contains("locked") ? "<i>Locked</i>" : b.firstElementChild.alt;
                });
            }
        });

        registerTip('info-box-breakdown', (el) => {
            const buttonElement = el.closest('.button-with-info')?.querySelector('button');
            if (!buttonElement) return '';

            const buildingType = buttonElement.dataset.buildingType;
            if (!buildingType) return '';

            let actionType = null;
            if (buttonElement.classList.contains('dropdown-add-building-btn')) actionType = 'build';
            else if (buttonElement.classList.contains('dropdown-sell-btn')) actionType = 'demolish';
            else if (buttonElement.classList.contains('dropdown-add-worker-btn')) actionType = 'hire';
            else if (buttonElement.classList.contains('dropdown-remove-worker-btn')) actionType = 'furlough';

            if (!actionType) return '';

            const panel = core.ui.panels.industry;
            let details = null;
            switch (actionType) {
                case 'build': details = panel.getBuildingButtonDetails(buildingType); break;
                case 'demolish': details = panel.getDemolishButtonDetails(buildingType); break;
                case 'hire': details = panel.getWorkerButtonDetails(buildingType); break;
                case 'furlough': details = panel.getFurloughButtonDetails(buildingType); break;
            }
            if (!details) return '';

            const fmt = core.settings.configs.numformat;
            const wisdom = core.city?.ruler?.wisdom || 0;
            const wisdomMult = wisdom > 0 ? 1 + wisdom * 0.01 : 1;

            const drainItems = [];
            const gainItems = [];

            details.costs?.forEach(c => {
                const v = c.amt || c.val || 0;
                if (v > 0) drainItems.push({ value: `-${formatNumber(v, fmt)}`, label: c.res + (c.amt !== undefined ? '' : '/s'), type: 'drain' });
            });
            details.rewards?.forEach(r => {
                const v = r.amt || 0;
                if (v > 0) gainItems.push({ value: `+${formatNumber(v, fmt)}`, label: r.res, type: 'gain' });
            });
            details.effects?.forEach(e => {
                const v = e.val || 0;
                if (v > 0) {
                    const item = { value: `${e.type === 'gain' ? '+' : '-'}${formatNumber(v, fmt)}`, label: `${e.res}/s`, type: e.type };
                    (e.type === 'gain' ? gainItems : drainItems).push(item);
                }
            });

            const capDrain = [];
            const capGain = [];
            details.capChanges?.forEach(c => {
                const v = c.val;
                if (v !== 0) {
                    const isPos = v > 0;
                    const item = { value: `${isPos ? '+' : ''}${formatNumber(v, fmt)}`, label: `${c.res} cap`, type: isPos ? 'gain' : 'drain' };
                    (isPos ? capGain : capDrain).push(item);
                }
            });

            const items = [...drainItems, ...gainItems];
            const capItems = [...capDrain, ...capGain];

            const mods = [];
            if (wisdom > 0 && gainItems.length > 0) {
                const start = drainItems.length;
                mods.push({ value: `×${formatNumber(wisdomMult, fmt)}`, label: 'wisdom', range: [start, start + gainItems.length - 1] });
            }

            if (capItems.length) {
                return createBreakdownBox({ items, modifiers: mods }) + createBreakdownBox({ items: capItems });
            }
            return createBreakdownBox({ items, modifiers: mods });
        });

        observeTooltips();
    })();

    return {
        registerTip, showTooltip, destroyTooltip, observeTooltips, setContextMenuService,
        checkSectionAndDismiss
    };
}
