import GeneralService from "../Services/GeneralService.js";
import TypingService from "../Services/TypingService.js";
import TooltipService from "../Services/TooltipService.js";

export default class GameUI {
    #tooltips;

    constructor(core) {
        this.core = core;
        this.#tooltips = TooltipService(core);

        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.userstatus = document.getElementById("user-status");

        this.initialize();
    }

    get tooltips() {
        return this.#tooltips;
    }

    initialize() {
        document.querySelectorAll(".navbutton").forEach(b => {
            b.onpointerdown = () => {
                this.activatePanel(document.querySelector("#" + b.dataset.panel));
            }
            this.#tooltips.registerTip(b.dataset.tip, () => {
                return b.classList.contains("locked") ? "<i>Locked&nbsp;</i>" : b.firstChild.alt;
            });
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

        this.#tooltips.observeTooltips();

        this.story.addEventListener('scroll', () => {
            GeneralService.verticalScroll(this.story, 5, true);
        });
        window.addEventListener("resize", () => {
            GeneralService.verticalScroll(this.story, 5, true);
        });

    }

    activatePanel(panel) {
        this.core.activePanel = panel;
        document.querySelectorAll('#navbar .chosen').forEach(el => el.classList.remove('chosen'));
        document.querySelector(`#navbar button[data-panel='${panel.id}']`).classList.add("chosen");
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

    addHint(msg, spanIDs = [], spanTexts = [], spanClasses = [], spanTips = []) {
        const box = document.createElement('div');
        const text = document.createElement('div');
        box.className = 'hintbox';
        box.appendChild(text);
        this.story.appendChild(box);

        TypingService.typeWithSpans(msg, text, spanIDs, spanTexts, spanClasses, spanTips).then(([body]) => {
            TypingService.collapseP(body);
        });

        return {
            destroy: async () => {
                box.style.transitionDuration = '0.2s';
                box.style.opacity = '0';
                box.style.translate = '0 0.5em';
                return GeneralService.waitForEvent(box, "transitionend", 200).then(() => {
                    box.remove();
                    return Promise.resolve();
                })
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
            return `<span style="padding-right: 0.33em;" class='term ${className}'>${stat.name}</span>
                    <span>${stat.value}</span>`;
        }).join('')}
    </div>`;
    }


}