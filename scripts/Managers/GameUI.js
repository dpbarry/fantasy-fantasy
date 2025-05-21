import GeneralService from "../Services/GeneralService.js";
import TypingService from "../Services/TypingService.js";

export default class GameUI {
    constructor(core) {
        this.core = core;
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.userstatus = document.getElementById("user-status");

        this.tooltips = new Map();
        this.initialize();
    }

    initialize() {
        document.querySelectorAll("#navbar button").forEach(b => b.onpointerdown = () => {
           this.activatePanel(document.querySelector("#"+b.dataset.panel));
        });

        // Setup nudge effects
        document.querySelectorAll(".nudge").forEach(b => b.addEventListener("pointerdown", () => b.classList.add("nudged")));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        // Setup keyboard
        document.querySelectorAll(".key").forEach(k => {
            k.tabIndex = 0;
            k.addEventListener("pointerdown", () => k.classList.add("nudged"));
            k.onpointerdown = () => {
                k.focus();

                setTimeout(() => {
                    let input = document.activeElement;
                    switch (k.innerText) {
                        case "⏎":
                            input.dispatchEvent(new KeyboardEvent('keydown', {
                                code: 'Enter', key: 'Enter', charCode: 13, keyCode: 13, view: window, bubbles: true
                            }));
                            break;
                        case "SPC":
                            input.dispatchEvent(new KeyboardEvent('keydown', {
                                code: 'Space', key: ' ', charCode: 32, keyCode: 32, view: window, bubbles: true
                            }));
                            break;
                        case "⟵":
                            input.value = input.value.slice(0, -1);
                            input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                            break;
                        default:
                            input.value = input.value + k.innerText;
                            input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                    }


                }, 0);
            };
        });

        this.observeTooltips();

        this.story.addEventListener('scroll', () => {
            GeneralService.verticalScroll(this.story, 2);
        });
        window.addEventListener("resize", () => {
            GeneralService.verticalScroll(this.story, 2);
        });

        this.initializeConstants();
    }

    activatePanel(panel) {
        this.core.activePanel = panel;
        document.querySelectorAll('#navbar .chosen').forEach(el => el.classList.remove('chosen'));
        document.querySelector(`#navbar button[data-panel='${panel.id}']`).classList.add("chosen");
    }
    
    initializeConstants() {

    }

    observeTooltips() {
        const attach = (el) => {
            // Mouse hover
            el.addEventListener('mouseenter', () => this.showTooltip(el));
            el.addEventListener('mouseleave', () => this.destroyTooltip(el));

            // Touch handling
            el.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse') return;
                e.preventDefault();
                this.showTooltip(el);
                const dismissHandler = (e) => {
                    if (e.target === el) return;
                    this.destroyTooltip(el);
                    document.removeEventListener('pointerdown', dismissHandler);
                    document.removeEventListener('pointerup', dismissHandler);
                    window.removeEventListener('scroll', dismissHandler, true);
                };

                // Add handler on next tick to avoid immediate triggering
                setTimeout(() => {
                    document.addEventListener('pointerdown', dismissHandler);
                    document.addEventListener('pointerup', dismissHandler);
                    window.addEventListener('scroll', dismissHandler, true);
                }, 0);
            });
        };


        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        [...(node.classList?.contains('hastip') ? [node] : []), ...node.querySelectorAll('.hastip')]
                            .forEach(el => {
                                attach.call(this, el);
                            });
                    });
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const node = mutation.target;
                    if (node.classList.contains('hastip')) {
                        attach.call(this, node);
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class']
        });

        document.querySelectorAll('.hastip').forEach(el => {
            attach.call(this, el);
        });

    }

    showTooltip(el) {
        if (el.querySelector('.tooltip')) return;
        const tooltipElement = document.createElement('div');
        tooltipElement.className = 'tooltip';
        tooltipElement.dataset.tip = el.dataset.tip;
        tooltipElement.style.opacity = "0"; // Start invisible for measurement
        tooltipElement.innerHTML = this.getTip(el);
        document.body.appendChild(tooltipElement);

        const PADDING = 8; // Minimum padding from viewport edges
        const MARGIN = 3; // Padding between tooltip and element

        const rect = el.getBoundingClientRect();
        const tooltipRect = tooltipElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate available space in each direction
        const spaceAbove = rect.top;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceLeft = rect.left;
        const spaceRight = viewportWidth - rect.right;

        // Determine best position
        let position;
        if (spaceAbove >= tooltipRect.height + PADDING && spaceLeft + rect.width >= tooltipRect.width) {
            position = 'above';
        } else if (spaceBelow >= tooltipRect.height + PADDING && spaceLeft + rect.width >= tooltipRect.width) {
            position = 'below';
        } else if (spaceLeft >= tooltipRect.width + PADDING) {
            position = 'left';
        } else if (spaceRight >= tooltipRect.width + PADDING) {
            position = 'right';
        } else {
            position = 'above'; // Fallback to above if no good position found
        }

        // Position the tooltip
        let top, left;
        tooltipElement.classList.remove('tooltip-above', 'tooltip-below', 'tooltip-left', 'tooltip-right');

        switch (position) {
            case 'above':
                top = rect.top - tooltipRect.height - MARGIN;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                tooltipElement.classList.add('tooltip-above');
                break;
            case 'below':
                top = rect.bottom + MARGIN;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                tooltipElement.classList.add('tooltip-below');
                break;
            case 'left':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.left - tooltipRect.width - MARGIN;
                tooltipElement.classList.add('tooltip-left');
                break;
            case 'right':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.right + MARGIN;
                tooltipElement.classList.add('tooltip-right');
                break;
        }

        // Adjust if tooltip would go outside viewport
        left = Math.max(PADDING, Math.min(left, viewportWidth - tooltipRect.width - PADDING));
        top = Math.max(PADDING, Math.min(top, viewportHeight - tooltipRect.height - PADDING));

        tooltipElement.style.top = `${top}px`;
        tooltipElement.style.left = `${left}px`;
        tooltipElement.style.opacity = ""; // Make visible after positioning

        // Setup update interval
        let updateInterval = setInterval(() => {
            try {
                tooltipElement.innerHTML = this.getTip(el);
            } catch {
                clearInterval(updateInterval);
            }
        }, 100);
    }

    destroyTooltip(el) {
        const tooltips = [...document.body.querySelectorAll('.tooltip')]
            .filter(t => t.dataset.tip === el.dataset.tip);

        tooltips.forEach(tooltip => {
            if (tooltip.isRemoving) return;
            tooltip.isRemoving = true;

            tooltip.style.opacity = "0";
            tooltip.ontransitionend = () => tooltip.remove();

            // Failsafe removal
            setTimeout(() => {
                if (tooltip.isConnected) tooltip.remove();
            }, 300);
        });
    }

    getTip(el) {
        const cb = this.tooltips.get(el.dataset.tip);
        if (!cb) {
            el.classList.remove("hastip");
            this.destroyTooltip(el);
            return;
        }
        return cb(el);
    }

    registerTip(type, cb) {
        this.tooltips.set(type, cb);
    }

    /**
     * @param {HTMLElement} el
     */
    unlockPanel(el) {
        el.querySelector(".lockedpanel").classList.add("hide");
        return new Promise(resolve => {
            el.querySelector(".lockedpanel").ontransitionend = () => {
                el.querySelector(".lockedpanel").remove();
                resolve();
            }
        })
    }

    addHint(msg, spanIDs = [], spanTexts = [], spanTips = []) {
        const box = document.createElement('div');
        const text = document.createElement('div');
        box.className = 'hintbox';
        box.appendChild(text);
        this.story.appendChild(box);

        TypingService.typeWithSpans(msg, text, spanIDs, spanTexts, spanTips);

        return {
            destroy: () => {
                box.style.opacity = '0';
                box.addEventListener('transitionend', () => {
                    box.remove();
                });
            }
        };
    }

    /**
     * @param {Array<{
     *   name: string,          // The display name of the stat
     *   value: string|number,  // The value to display for the stat
     *   class?: string         // Optional CSS class for styling the stat name
     * }>} stats
     * @returns {string} HTML string containing the formatted grid layout
     */
    createStatsGrid(stats) {
        return `<div class="statgrid">
        ${stats.map(stat => {
            const className = stat.class || '';
            return `<span style="padding-right: 0.33em;" class='${className}'>${stat.name}</span>
                    <span>${stat.value}</span>`;
        }).join('')}
    </div>`;
    }


}