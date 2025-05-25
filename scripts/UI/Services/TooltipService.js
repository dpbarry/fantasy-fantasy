import createStatsGrid from "../Components/StatGrid.js";

export default function createTooltipService() {
    const tooltips = new Map();
    const pointerDismissHandlers = new WeakMap();
    let observer = null;

    function registerTip(type, cb) {
        tooltips.set(type, cb);
    }

    function getTip(el) {
        if (!el?.dataset?.tip) return '';
        const cb = tooltips.get(el.dataset.tip);
        if (!cb) {
            el.classList.remove('hastip');
            destroyTooltip(el);
            return '';
        }
        return cb(el);
    }

    function initialize(core) {
        registerTip('savvy', () => `
      <p><i>Measures economic know-how.</i></p>
      <p>Each point of <span class="savvyWord term">Savvy</span> grants a +1% boost to all stats related to the economy.</p>
      <p>Current boost: +${core.mc.savvy}%</p>
    `);

        registerTip('valor', () => `
      <p><i>Measures military expertise.</i></p>
      <p>Each point of <span class="valorWord term">Valor</span> grants a +1% boost to all stats related to the army.</p>
      <p>Current boost: +${core.mc.valor}%</p>
    `);

        registerTip('wisdom', () => `
      <p><i>Measures scholastic prowess.</i></p>
      <p>Each point of <span class="wisdomWord term">Wisdom</span> grants a +1% boost to all stats related to research.</p>
      <p>Current boost: +${core.mc.wisdom}%</p>
    `);


        registerTip('bond', () => `
      <p><i>Quantifies closeness with someone.</i></p>
      <p>Spans a spectrum where -100% <span class="bondWord term">Bond</span> denotes an arch-nemesis and 100% denotes a soulmate.</p>
    `);

        registerTip('mc-name', () => {
            const stats = [{name: "Savvy", value: core.mc.savvy, class: "savvyWord"}, {
                name: "Valor", value: core.mc.valor, class: "valorWord"
            }, {name: "Wisdom", value: core.mc.wisdom, class: "wisdomWord"}, {
                name: "Morality", value: core.mc.morality, class: "moralWord"
            },];

            return createStatsGrid(stats);
        });

        registerTip('verbosedate', () => {
            return core.clock.gameDate({format: "verbose"});
        });

        // NAVBAR
        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            b.onpointerdown = () => core.activeScreen = b.dataset.panel;
            registerTip(b.dataset.tip, () => {
                return b.classList.contains("locked") ? "<i>Locked&nbsp;</i>" : b.firstChild.alt;
            });
        });

        observeTooltips();
    }


    function showTooltip(el) {
        if (el.querySelector('.tooltip')) return;

        const tipBox = document.createElement('div');
        tipBox.className = 'tooltip';
        tipBox.dataset.tip = el.dataset.tip;
        tipBox.style.opacity = '0';
        tipBox.innerHTML = getTip(el);
        document.body.appendChild(tipBox);

        const PADDING = 8, MARGIN = 3;
        const r = el.getBoundingClientRect();
        const tb = tipBox.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;

        const space = {
            above: r.top, below: vh - r.bottom, left: r.left, right: vw - r.right,
        };

        let pos;
        if (space.above >= tb.height + PADDING && space.left + r.width >= tb.width) {
            pos = 'above';
        } else if (space.below >= tb.height + PADDING && space.left + r.width >= tb.width) {
            pos = 'below';
        } else if (space.left >= tb.width + PADDING) {
            pos = 'left';
        } else if (space.right >= tb.width + PADDING) {
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

        const updater = setInterval(() => {
            try {
                tipBox.innerHTML = getTip(el);
            } catch {
                clearInterval(updater);
            }
        }, 100);
    }

    function destroyTooltip(el) {
        const all = Array.from(document.body.querySelectorAll('.tooltip'))
            .filter(t => t.dataset.tip === el.dataset.tip);

        all.forEach(tip => {
            if (tip.isRemoving) return;
            tip.isRemoving = true;
            tip.style.opacity = '0';
            tip.ontransitionend = () => tip.remove();
            setTimeout(() => tip.remove(), 300);
        });
    }

    function addDismissHandlers(el, cb) {
        pointerDismissHandlers.set(el, cb);
        document.addEventListener('pointerdown', cb);
        document.addEventListener('pointerup', cb);
        window.addEventListener('scroll', cb, true);
    }

    function removeDismissHandlers(el) {
        const cb = pointerDismissHandlers.get(el);
        if (!cb) return;
        document.removeEventListener('pointerdown', cb);
        document.removeEventListener('pointerup', cb);
        window.removeEventListener('scroll', cb, true);
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
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });

        document.querySelectorAll('.hastip').forEach(attach);
    }

    return {
        initialize,
        registerTip,
        showTooltip,
        destroyTooltip,
        observeTooltips,
    };
}
