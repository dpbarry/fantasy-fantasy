import createTooltipService from "../Services/TooltipService.js";
import setupKeyboard from "../UI/Components/Keyboard.js";
import setupGlobalBehavior, {spawnRipple} from "../Services/GlobalBehavior.js";
import {verticalScroll} from "../Utils.js";
import StoryPanel from "../UI/Panels/StoryPanel.js";
import NewsPanel from "../UI/Panels/NewsPanel.js";
import SettingsPanel from "../UI/Panels/SettingsPanel.js";
import IndustryPanel from "../UI/Panels/IndustryPanel.js";

export default class UIManager {
    constructor(core) {
        this.core = core;

        this.tooltipService = createTooltipService(core);
        this.activePanels = {
            "left": "",
            "center": "story",
            "right": "settings"
        };
        this.visibleSection = "center";
        this.renderLoops = [];
        this.initialize();
    }

    // after initialization so that the necessary managers are formed
    readyPanels() {
        this.panels = {
            story: new StoryPanel(this.core),
            news: new NewsPanel(this.core),
            settings: new SettingsPanel(this.core),
            industry: new IndustryPanel(this.core),
        }
    }

    boot() {
        setupGlobalBehavior(this.core);
        this.showPanels();
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("news");

        this.left = document.getElementById("left");
        this.center = document.getElementById("center");
        this.right = document.getElementById("right");

        this.industry = document.getElementById("industry");

        this.settings = document.getElementById("settings");
        
        this.canvas = this.newCanvas();
    }

    initialize() {
        this.tooltipService.initialize(this.core);
        this.initNavbar();
        this.initShortcuts();
        this.initEventListeners();
    }

    initNavbar() {
        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            b.onpointerdown = () => this.show(b.dataset.loc, b.dataset.panel);
        });
    }

    newCanvas() {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '1000';
        document.body.appendChild(canvas);
        
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        return canvas;
    }

    initEventListeners() {
        document.querySelectorAll(".nudge").forEach(b => b.addEventListener("pointerdown", () => b.classList.add("nudged")));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        document.querySelectorAll(".ripples").forEach(el => {
            el.addEventListener("pointerdown", (e) => {
                spawnRipple(e, el);
            });
        });

        const interactiveObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        if (node.classList.contains("nudge")) {
                            node.addEventListener("pointerdown", () => node.classList.add("nudged"));
                        }
                        if (node.classList.contains("ripples")) {
                            node.addEventListener("click", (e) => {
                                spawnRipple(e, node);
                            });
                        }

                        node.querySelectorAll?.(".nudge").forEach(b => {
                            b.addEventListener("pointerdown", () => b.classList.add("nudged"));
                        });
                        node.querySelectorAll?.(".ripples").forEach(el => {
                            el.addEventListener("click", (e) => {
                                spawnRipple(e, el);
                            });
                        });
                    }
                });
            });
        });

        interactiveObserver.observe(document.body, {
            childList: true, subtree: true
        });

        setupKeyboard();
        this.story.addEventListener("scroll", () => {
            verticalScroll(this.story, 5, true);
        });
        window.addEventListener("resize", () => {
            verticalScroll(this.story, 5, true);
        });
    }


    show(loc, panel) {
        if (this.activePanels[loc] === undefined || !panel) return;

        if (this.activePanels[loc] && this.activePanels[loc] !== panel) {
            this.panels[this.activePanels[loc]].updateVisibility(loc, panel);
        }
        this.activePanels[loc] = panel;
        this.panels[panel].updateVisibility(loc, panel);

        document.querySelectorAll(`.navbutton.chosen[data-loc='${loc}']`).forEach(el => el.classList.remove("chosen"));
        let button = document.querySelector(`.navbutton[data-panel='${panel}']`);
        if (button) {
            button.classList.add("chosen");
        }
    }

    showPanels() {
        Object.entries(this.activePanels).forEach((a) => {
            let [loc, panel] = a;
            this.show(loc, panel);
        });
    }

    createRenderInterval(fn) {
        const interval =  setInterval(() => {fn();}, this.core.settings.refreshUI);
        this.renderLoops.push({interval: interval, fn: fn});
        return interval;
    }

    destroyRenderInterval(interval) {
        const i = this.renderLoops.findIndex(i => i.interval === interval);
        clearInterval(interval);
        this.renderLoops.splice(i, 1);
    }

    updateRenderIntervals() {
        for (const pair of this.renderLoops) {
           clearInterval(pair.interval);
           pair.interval = setInterval(pair.fn, this.core.settings.refreshUI);
        }
    }

    serialize() {
        return {activePanels: this.activePanels, visibleSection: this.visibleSection};
    }

    deserialize(data) {
        this.activePanels = data.activePanels;
        this.visibleSection = data.visibleSection;
    }
}
