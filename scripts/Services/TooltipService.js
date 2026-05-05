import createBreakdownBox from "../UI/Components/BreakdownBox.js";

export default function createTooltipService(core) {
    const tooltips = new Map();
    let observer = null;
    const activeTips = new Map();

    const pointerDismissHandlers = new WeakMap();
    const pendingTooltips = new Map();
    const tooltipShownFromHold = new WeakMap();

    let tooltipLocked = false;
    let contextMenuService = null;
    let lastPointer = null;
    let hoverRefreshQueued = false;
    const createRenderInterval = core.ui.createRenderInterval.bind(core.ui);
    const destroyRenderInterval = core.ui.destroyRenderInterval.bind(core.ui);

    const canHover = window.matchMedia('(hover: hover)').matches;
    const fmt = (val, opt) => core.ui.formatNumber(val, opt);

    const getActiveAnchors = () => {
        const anchors = new Set();
        activeTips.forEach(map => map.forEach(el => anchors.add(el)));
        return [...anchors];
    };

    const getActiveKeysForElement = (el) => {
        const keys = [];
        activeTips.forEach(map => map.forEach((anchor, key) => {
            if (anchor === el) keys.push(key);
        }));
        return keys;
    };

    function setContextMenuService(service) {
        contextMenuService = service;
    }

    function isHoveringActive(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        for (const tip of activeTips.keys()) {
            if (tip === el || tip.contains(el)) return true;
        }
        for (const anchor of getActiveAnchors()) {
            if (anchor === el || anchor.contains(el)) return true;
        }
        return false;
    }

    function refreshHoveredTooltip() {
        if (!canHover) return;
        if (!lastPointer || tooltipLocked) return;
        if (!document.hasFocus()) return;
        const { x, y } = lastPointer;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
        const hovered = document.elementFromPoint(x, y)?.closest('.hastip');
        if (!hovered || getActiveAnchors().includes(hovered)) return;
        if (!getTips(hovered).length) return;
        showTooltip(hovered);
    }

    function queueHoverRefresh() {
        if (!canHover) return;
        if (hoverRefreshQueued || !lastPointer) return;
        hoverRefreshQueued = true;
        requestAnimationFrame(() => {
            hoverRefreshQueued = false;
            refreshHoveredTooltip();
        });
    }


    function cleanupAllTooltips() {
        document.querySelectorAll(".tooltip").forEach(tip => {
            if (tip._updateInterval) {
                destroyRenderInterval(tip._updateInterval);
                tip._updateInterval = null;
            }
            tip.remove();
            const map = activeTips.get(tip);
            if (map) {
                map.forEach(anchor => {
                    const timeout = pendingTooltips.get(anchor);
                    clearTimeout(timeout);
                    pendingTooltips.delete(anchor);
                    tooltipShownFromHold.delete(anchor);
                    removeDismissHandlers(anchor);
                });
            }
        });
        pendingTooltips.forEach((timeout, anchor) => {
            clearTimeout(timeout);
            pendingTooltips.delete(anchor);
            tooltipShownFromHold.delete(anchor);
            removeDismissHandlers(anchor);
        });
        tooltipLocked = false;
        activeTips.clear();
    }

    function registerTip(type, cb) {
        tooltips.set(type, cb);
    }

    function getTip(el, tipKey) {
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
            if (content) tips.push({ key, content });
        }
        return tips;
    }



    const PADDING = 8, MARGIN = 3, MULTI_GAP = 4, ARROW_MIN = 12;
    const clamp = (v, min, max) => Math.max(min, Math.min(v, max));

    function isDialogMountRoot(mount) {
        return mount && mount !== document.body && mount.tagName === 'DIALOG';
    }

    function getTooltipMountRoot(anchor) {
        return anchor?.closest('dialog[open]') || document.body;
    }

    const TIP_POS_FOUR = Object.freeze(['above', 'below', 'left', 'right']);

    function getTooltipPositionPreference(anchor) {
        const raw = String(anchor?.dataset?.tipPrefer || '').toLowerCase();
        if (TIP_POS_FOUR.includes(raw)) return raw;
        for (const s of TIP_POS_FOUR) {
            if (anchor?.classList?.contains(`tooltip-prefer-${s}`)) return s;
        }
        return null;
    }

    function buildTooltipPosOrder(preferred) {
        if (!preferred || !TIP_POS_FOUR.includes(preferred)) return [...TIP_POS_FOUR];
        return [preferred, ...TIP_POS_FOUR.filter((p) => p !== preferred)];
    }

    function fitsInViewport(r, boxW, boxH, vw, vh) {
        const space = { above: r.top, below: vh - r.bottom, left: r.left, right: vw - r.right };
        const horizontalBuffer = Math.max(0, (boxW - r.width) / 2);
        const canCenter =
            (r.left - horizontalBuffer) >= PADDING && (r.right + horizontalBuffer) <= (vw - PADDING);
        return (pos) => {
            switch (pos) {
                case 'above':
                case 'below':
                    return space[pos] >= boxH + PADDING && canCenter;
                case 'left':
                    return (r.left - boxW - MARGIN) >= PADDING;
                case 'right':
                    return (r.right + boxW + MARGIN) <= (vw - PADDING);
                default:
                    return false;
            }
        };
    }

    function calcPosition(r, tb, vw, vh, preferred) {
        const order = buildTooltipPosOrder(preferred);
        const fits = fitsInViewport(r, tb.width, tb.height, vw, vh);
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const pos = order.find(fits) || 'above';

        let top, left;
        if (pos === 'above') {
            top = r.top - tb.height - MARGIN;
            left = cx - tb.width / 2;
        } else if (pos === 'below') {
            top = r.bottom + MARGIN;
            left = cx - tb.width / 2;
        } else if (pos === 'left') {
            top = cy - tb.height / 2;
            left = r.left - tb.width - MARGIN;
        } else {
            top = cy - tb.height / 2;
            left = r.right + MARGIN;
        }

        left = clamp(left, PADDING, vw - tb.width - PADDING);
        top = clamp(top, PADDING, vh - tb.height - PADDING);

        const arrowX =
            pos === 'above' || pos === 'below' ? clamp(cx - left, ARROW_MIN, tb.width - ARROW_MIN) : undefined;
        const arrowY =
            pos === 'left' || pos === 'right' ? clamp(cy - top, ARROW_MIN, tb.height - ARROW_MIN) : undefined;

        return { pos, top, left, arrowX, arrowY };
    }

    function positionSingleTooltip(el, tipBox) {
        const r = el.getBoundingClientRect();
        const tb = tipBox.getBoundingClientRect();
        const result = calcPosition(
            r,
            tb,
            window.innerWidth,
            window.innerHeight,
            getTooltipPositionPreference(el)
        );
        const mount = tipBox._tooltipMount;
        const dr = isDialogMountRoot(mount) ? mount.getBoundingClientRect() : null;

        tipBox.className = tipBox.className.replace(/tooltip-(above|below|left|right)/g, '');
        tipBox.classList.add(`tooltip-${result.pos}`);
        if (dr) {
            tipBox.style.position = 'absolute';
            tipBox.style.top = `${result.top - dr.top}px`;
            tipBox.style.left = `${result.left - dr.left}px`;
        } else {
            tipBox.style.position = '';
            tipBox.style.top = `${result.top}px`;
            tipBox.style.left = `${result.left}px`;
        }

        if (result.arrowX !== undefined) tipBox.style.setProperty('--tooltip-arrow-x', `${result.arrowX}px`);
        if (result.arrowY !== undefined) tipBox.style.setProperty('--tooltip-arrow-y', `${result.arrowY}px`);
    }

    function positionMultiTooltips(el, tipBoxes) {
        const r = el.getBoundingClientRect();
        const boxes = tipBoxes.map((tb) => tb.getBoundingClientRect());
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const space = { above: r.top, below: vh - r.bottom, left: r.left, right: vw - r.right };
        const mount = tipBoxes[0]?._tooltipMount;
        const dr = isDialogMountRoot(mount) ? mount.getBoundingClientRect() : null;
        const ox = dr ? (x) => x - dr.left : (x) => x;
        const oy = dr ? (y) => y - dr.top : (y) => y;
        const setPos = (tip, topPx, leftPx) => {
            if (dr) {
                tip.style.position = 'absolute';
                tip.style.top = `${oy(topPx)}px`;
                tip.style.left = `${ox(leftPx)}px`;
            } else {
                tip.style.position = '';
                tip.style.top = `${topPx}px`;
                tip.style.left = `${leftPx}px`;
            }
        };

        const totalW = boxes.reduce((s, b) => s + b.width, 0) + MULTI_GAP * (boxes.length - 1);
        const totalH = boxes.reduce((s, b) => s + b.height, 0) + MULTI_GAP * (boxes.length - 1);
        const maxW = Math.max(...boxes.map((b) => b.width));
        const maxH = Math.max(...boxes.map((b) => b.height));
        const vertical = boxes.reduce((s, b) => s + b.width / b.height, 0) / boxes.length > 1;

        const preferred = getTooltipPositionPreference(el);
        const order = buildTooltipPosOrder(preferred);

        let pos;
        if (vertical) {
            const verticalOrder = order.filter((p) => p === 'above' || p === 'below');
            const fitsV = fitsInViewport(r, maxW, totalH, vw, vh);
            pos = verticalOrder.find(fitsV) || (space.above >= space.below ? 'above' : 'below');
        } else {
            const horizOrder = order.filter((p) => p === 'left' || p === 'right');
            const fitsH = (p) => {
                if (p === 'right') return (r.right + totalW + MARGIN) <= (vw - PADDING);
                if (p === 'left') return (r.left - totalW - MARGIN) >= PADDING;
                return false;
            };
            pos = horizOrder.find(fitsH) || (space.right >= space.left ? 'right' : 'left');
        }

        let closestIdx, gTop, gLeft;

        if (vertical) {
            closestIdx = pos === 'above' ? boxes.length - 1 : 0;
            gTop = pos === 'above' ? r.top - MARGIN - totalH : r.bottom + MARGIN;
            gLeft = clamp(cx - maxW / 2, PADDING, vw - maxW - PADDING);
            gTop = clamp(gTop, PADDING, vh - totalH - PADDING);

            let curTop = gTop;
            tipBoxes.forEach((tip, i) => {
                tip.className = tip.className.replace(/tooltip-(above|below|left|right|no-arrow)/g, '');
                tip.classList.add(`tooltip-${pos}`);
                if (i !== closestIdx) tip.classList.add('tooltip-no-arrow');

                const boxLeft = gLeft + (maxW - boxes[i].width) / 2;
                setPos(tip, curTop, boxLeft);
                tip.style.opacity = '';

                if (i === closestIdx) {
                    tip.style.setProperty('--tooltip-arrow-x', `${clamp(cx - boxLeft, ARROW_MIN, boxes[i].width - ARROW_MIN)}px`);
                }
                curTop += boxes[i].height + MULTI_GAP;
            });
        } else {
            closestIdx = pos === 'left' ? boxes.length - 1 : 0;
            gLeft = pos === 'left' ? r.left - MARGIN - totalW : r.right + MARGIN;
            gTop = clamp(cy - maxH / 2, PADDING, vh - maxH - PADDING);
            gLeft = clamp(gLeft, PADDING, vw - totalW - PADDING);

            let curLeft = gLeft;
            tipBoxes.forEach((tip, i) => {
                tip.className = tip.className.replace(/tooltip-(above|below|left|right|no-arrow)/g, '');
                tip.classList.add(`tooltip-${pos}`);
                if (i !== closestIdx) tip.classList.add('tooltip-no-arrow');

                const boxTop = gTop + (maxH - boxes[i].height) / 2;
                setPos(tip, boxTop, curLeft);
                tip.style.opacity = '';

                if (i === closestIdx) {
                    tip.style.setProperty('--tooltip-arrow-y', `${clamp(cy - boxTop, ARROW_MIN, boxes[i].height - ARROW_MIN)}px`);
                }
                curLeft += boxes[i].width + MULTI_GAP;
            });
        }
    }

    function repositionTooltips(el, tipBoxes) {
        if (!el || !tipBoxes?.length) return;
        if (tipBoxes.length === 1) {
            positionSingleTooltip(el, tipBoxes[0]);
        } else {
            positionMultiTooltips(el, tipBoxes);
        }
    }


    function showTooltip(el, opts = {}) {
        const keys = getTipKeys(el);
        const currentKeys = getActiveKeysForElement(el);
        const sameKeys = currentKeys.length && keys.join('@') === currentKeys.join('@');
        if (currentKeys.length && sameKeys && !opts.refresh) return;

        tooltipLocked = true;
        cleanupAllTooltips();

        const tips = getTips(el);
        if (tips.length === 0) {
            tooltipLocked = false;
            return;
        }

        const mountRoot = getTooltipMountRoot(el);

        const tipBoxes = tips.map(tip => {
            const tipBox = document.createElement('div');
            tipBox.className = 'tooltip';
            tipBox.dataset.tip = tip.key;
            tipBox.style.opacity = '0';
            tipBox.innerHTML = tip.content;
            tipBox._lastContent = tip.content;
            tipBox._tooltipMount = mountRoot;

            mountRoot.appendChild(tipBox);

            return tipBox;
        });

        if (tipBoxes.length === 1) {
            const tipBox = tipBoxes[0];
            positionSingleTooltip(el, tipBox);
            tipBox.style.opacity = '';
        } else {
            positionMultiTooltips(el, tipBoxes);
        }

        tipBoxes.forEach((tipBox, idx) => {
            const key = tips[idx].key;
            activeTips.set(tipBox, new Map([[key, el]]));
        });

        tooltipLocked = false;

        const clearTipInterval = (box) => {
            if (box?._updateInterval) {
                destroyRenderInterval(box._updateInterval);
                box._updateInterval = null;
            }
        };

        tipBoxes.forEach((tipBox, idx) => {
            const key = tips[idx].key;
            const updaterFn = () => {
                try {
                    const tipMap = activeTips.get(tipBox);
                    if (!document.body.contains(tipBox) || !tipMap || tipMap.get(key) !== el) {
                        clearTipInterval(tipBox);
                        return;
                    }

                    const updatedTips = getTips(el);
                    const updatedTip = updatedTips.find(t => t.key === key);

                    if (updatedTips.length !== tipBoxes.length || !updatedTip) {
                        clearTipInterval(tipBox);
                        cleanupAllTooltips();
                        if (updatedTips.length > 0) showTooltip(el);
                        return;
                    }


                    if (tipBox._lastContent !== updatedTip.content) {
                        tipBox.innerHTML = updatedTip.content;
                        tipBox._lastContent = updatedTip.content;
                        repositionTooltips(el, tipBoxes);
                    }

                    activeTips.set(tipBox, new Map([[key, el]]));
                } catch {
                    clearTipInterval(tipBox);
                }
            };

            tipBox._updateInterval = createRenderInterval(updaterFn);
        });
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
        clearTimeout(timeout);
        pendingTooltips.delete(el);
        tooltipShownFromHold.delete(el);
        removeDismissHandlers(el);
        cleanupAllTooltips();
    }

    function onMouseEnter(e) {
        if (!canHover) return;
        showTooltip(e.currentTarget);
    }

    function onMouseLeave() {
        if (!canHover) return;
        cleanupAllTooltips();
    }

    function onPointerDown(e) {
        const el = e.currentTarget;
        if (e.pointerType === 'mouse') return;

        if (getActiveKeysForElement(el).length > 0) {
            const timeout = pendingTooltips.get(el);
            clearTimeout(timeout);
            pendingTooltips.delete(el);
            cleanupAllTooltips();
            return;
        }

        const existingTimeout = pendingTooltips.get(el);
        clearTimeout(existingTimeout);
        pendingTooltips.delete(el);

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
                cleanupAllTooltips();
                removeDismissHandlers(el);
                tooltipShownFromHold.delete(el);
            };

            setTimeout(() => addDismissHandlers(el, dismiss), 0);
        }, delay);

        pendingTooltips.set(el, timeout);

        const cancelOnUp = () => {
            const timeout = pendingTooltips.get(el);
            clearTimeout(timeout);
            pendingTooltips.delete(el);
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
            let shouldRefreshHover = false;
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
                    shouldRefreshHover = true;
                } else if (m.type === 'attributes' && (m.attributeName === 'class' || m.attributeName === 'data-tips')) {
                    const tgt = m.target;
                    if (tgt.classList.contains('hastip')) attach(tgt);
                    else if (m.attributeName === 'class') detach(tgt);
                    shouldRefreshHover = true;

                    const activeKeys = getActiveKeysForElement(tgt);
                    if (activeKeys.length) {
                        const newKeys = getTipKeys(tgt);
                        if (newKeys.join('@') !== activeKeys.join('@')) {
                            showTooltip(tgt, { refresh: true });
                        }
                    }
                }
            });

            if (shouldRefreshHover) queueHoverRefresh();
        });

        observer.observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-tips'],
        });

        document.querySelectorAll('.hastip').forEach(attach);
    }

    (function initialize() {
        document.addEventListener('dialogclose', () => {
            activeTips.forEach((map, tipBox) => {
                if (!document.contains(tipBox)) {
                    map.forEach(anchor => {
                        const timeout = pendingTooltips.get(anchor);
                        clearTimeout(timeout);
                        pendingTooltips.delete(anchor);
                        tooltipShownFromHold.delete(anchor);
                        removeDismissHandlers(anchor);
                    });
                    activeTips.delete(tipBox);
                }
            });
        });

        window.addEventListener('blur', () => {
            lastPointer = null;
            if (activeTips.size) cleanupAllTooltips();
        });

        window.addEventListener('mouseleave', () => {
            lastPointer = null;
            if (activeTips.size) cleanupAllTooltips();
        });

        window.addEventListener('resize', () => {
            if (!canHover) {
                if (activeTips.size) cleanupAllTooltips();
                return;
            }
            cleanupAllTooltips();
            refreshHoveredTooltip();
        });

        document.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            lastPointer = { x: e.clientX, y: e.clientY };
            if (!canHover) return;

            const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
            const tooltipElement = elementAtPoint?.closest('[data-tips]');
            const hasTips = tooltipElement && getTips(tooltipElement).length > 0;

            const anchors = getActiveAnchors();
            if (hasTips && !anchors.includes(tooltipElement)) {
                if (anchors.length) cleanupAllTooltips();
                showTooltip(tooltipElement);
                return;
            }

            if (!anchors.length || !activeTips.size || tooltipLocked) return;

            if (!isHoveringActive(e.clientX, e.clientY)) cleanupAllTooltips();
        }, { passive: true });

        window.addEventListener("scroll", cleanupAllTooltips, true);

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

        registerTip('theurgy-plant', () => `<p style="color: var(--gainColor);">+1 crops</p>`);

        registerTip('theurgy-harvest', () => {
            const canHarvest = core.industry.canPerformTheurgy('harvest');
            if (!canHarvest) return `<p style="opacity: 0.7; font-style: italic">Requires 1 crop</p>`;
            return `<p style="color: var(--drainColor);">-1 crops</p><p style="color: var(--gainColor);">+1 food</p>`;
        });

        registerTip('increment-amount', () => {
            const inc = core.industry?.getSelectedIncrement?.() || 1;
            return `<p>Increment by ${inc === 'max' ? 'maximum' : inc}</p>`;
        });

        registerTip('resource-name', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';

            const panel = core.ui.panels.industry;
            const data = panel.formatResourceTooltip(res);
            const capHtml = panel.formatResourceCapSummary(res);

            if (!data) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>${capHtml}`;
            }

            return createBreakdownBox(data) + capHtml;
        });

        registerTip('resource-rate', (el) => {
            const res = el.dataset.resource;
            if (!res || !core.industry.resources[res]) return '';

            const panel = core.ui.panels.industry;
            const data = panel.formatResourceTooltip(res);
            if (!data) {
                return `<p style="opacity: 0.7; font-style: italic">No production</p>`;
            }

            return createBreakdownBox(data);
        });

        registerTip('build', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const data = panel.formatActionTooltip('build', type);
            if (!data) return '';
            return createBreakdownBox(data);
        });

        registerTip('demolish', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const data = panel.formatActionTooltip('sell', type);
            if (!data) return '';
            return createBreakdownBox(data);
        });

        registerTip('demolish-warning', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const warning = panel.getDemolishWorkerWarning(type);
            return warning ? `<p>${warning}</p>` : '';
        });

        registerTip('hire', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const data = panel.formatActionTooltip('hire', type);
            if (!data) return '';
            return createBreakdownBox(data);
        });

        registerTip('furlough', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const data = panel.formatActionTooltip('furlough', type);
            if (!data) return '';
            return createBreakdownBox(data);
        });

        registerTip('building-effects', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const sections = panel.formatAggregateTooltip(type, 'base');
            if (!sections || sections.length === 0) return '';
            return sections.map(s => createBreakdownBox(s)).join('');
        });

        registerTip('worker-effects', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';
            const panel = core.ui.panels.industry;
            const data = panel.formatAggregateTooltip(type, 'worker');
            if (!data || data.length === 0) return '';
            return data.map(s => createBreakdownBox(s)).join('');
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
            const dataArray = [];

            for (const [res, cost] of Object.entries(def.buildCost)) {
                if (!resources[res]) continue;

                const current = resources[res].value.toNumber();
                const costVal = panel.getValueNumber(cost);
                const needed = costVal * target - current;

                if (needed <= 0) continue;

                const rate = resources[res].netGrowthRate.toNumber();
                if (rate <= 0) {
                    dataArray.push({
                        chain: [{
                            value: fmt(needed),
                            label: res,
                            tone: 'drain',
                            note: 'no gain',
                            children: []
                        }],
                        resultRows: []
                    });
                    continue;
                }

                const time = needed / rate;
                const item = {
                    value: fmt(needed, { decimalPlaces: 2 }),
                    label: res,
                    note: 'remaining'
                };
                const mod = {
                    value: `÷ ${fmt(rate)}/s`,
                    label: 'prod.'
                };
                const resultRows = [{
                    value: panel.formatTime(time),
                    label: '',
                    tone: 'neutral'
                }];

                dataArray.push({
                    chain: [{
                        value: item.value,
                        label: item.label,
                        note: item.note,
                        tone: 'neutral',
                        children: [{
                            value: mod.value,
                            label: '',
                            note: mod.label,
                            tone: 'neutral',
                            children: []
                        }]
                    }],
                    resultRows
                });
            }

            if (dataArray.length === 0) return '';
            return dataArray.map(data => createBreakdownBox(data)).join('');
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
            const buildingNamePlural = `${buildingName}${b.count !== 1 ? 's' : ''}`;

            const data = {
                chain: [{
                    value: `${perBuilding}`,
                    label: 'worker cap',
                    tone: 'neutral',
                    children: [{
                        value: `×${b.count}`,
                        label: '',
                        note: buildingNamePlural,
                        tone: 'neutral',
                        children: []
                    }]
                }],
                resultRows: [{
                    value: `${total}`,
                    label: 'worker cap',
                    tone: 'neutral'
                }]
            };

            return createBreakdownBox(data);
        });

        registerTip('worker-limited', (el) => {
            const type = el.dataset.buildingType;
            if (!type) return '';

            const def = core.industry.constructor.BUILDING_DEFS[type];
            const b = core.industry.buildings[type];
            if (!def || !b || !b.workers || b.workers === 0) return '';

            const scale = core.industry.getWorkerScalingFactor();
            if (scale >= 1) return '';

            const data = core.industry.getAggregateEffects(type, 'worker');
            if (!data || !data.effects || data.effects.length === 0) return '';

            const potentialByRes = {};
            for (const eff of data.effects) {
                const { resource, direction, value } = eff;
                potentialByRes[resource] = (potentialByRes[resource] || 0) + (direction === 'gain' ? value : -value);
            }

            const resultRows = Object.entries(potentialByRes)
                .filter(([, val]) => Math.abs(val) >= 0.0001)
                .map(([resource, val]) => ({
                    value: `${val > 0 ? '+' : ''}${fmt(val)}`,
                    label: `${resource}/s`,
                    tone: val > 0 ? 'gain' : 'drain'
                }));

            if (!resultRows.length) return '';

            return createBreakdownBox({
                header: 'Potential',
                chain: [{
                    value: `×${(scale * 100).toFixed(0)}%`,
                    label: '',
                    note: 'throttled',
                    tone: 'neutral',
                    children: []
                }],
                resultRows
            });
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

        // Ledger tabs already carry their label as text — only show a tooltip
        // when locked, matching the navbutton "Locked" treatment.
        document.querySelectorAll(".ledger-tab").forEach(b => {
            const tipKey = getTipKeys(b)[0];
            if (tipKey) {
                registerTip(tipKey, () => b.classList.contains("locked") ? "<i>Locked</i>" : "");
            }
        });

        observeTooltips();
    })();

    function immediateRefresh(el) {
        if (!el) return;
        const tipsForEl = [];
        activeTips.forEach((map, tipBox) => {
            map.forEach((anchor, key) => {
                if (anchor === el) tipsForEl.push({ tipBox, key });
            });
        });
        if (!tipsForEl.length) return;

        const tipBoxes = tipsForEl.map(t => t.tipBox);
        const updatedTips = getTips(el);

        if (updatedTips.length !== tipBoxes.length) {
            cleanupAllTooltips();
            if (updatedTips.length > 0) showTooltip(el);
            return;
        }

        let repositioned = false;
        tipsForEl.forEach(({ tipBox, key }) => {
            const updatedTip = updatedTips.find(t => t.key === key);
            if (!updatedTip) return;
            if (tipBox._lastContent !== updatedTip.content) {
                tipBox.innerHTML = updatedTip.content;
                tipBox._lastContent = updatedTip.content;
                repositioned = true;
            }
        });
        if (repositioned) repositionTooltips(el, tipBoxes);
    }

    return {
        showTooltip, cleanupAllTooltips, observeTooltips, setContextMenuService, immediateRefresh,
    };
}
