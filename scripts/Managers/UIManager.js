import createTooltipService from "../Services/TooltipService.js";
import createContextMenuService from "../Services/ContextMenuService.js";
import setupGlobalBehavior, {spawnRipple} from "../Services/GlobalBehavior.js";
import {verticalScroll, formatNumber as baseFormatNumber} from "../Utils.js";
import StoryPanel from "../UI/Panels/StoryPanel.js";
import NewsPanel from "../UI/Panels/NewsPanel.js";
import SettingsPanel from "../UI/Panels/SettingsPanel.js";
import IndustryPanel from "../UI/Panels/IndustryPanel.js";

export default class UIManager {
    constructor(core) {
        this.core = core;
        this.activePanels = {
            "left": "",
            "center": "story",
            "right": "settings"
        };
        this.visibleSection = "center";
        this.renderLoops = [];
        this.initialize();
    }

    initialize() {
        this.initShortcuts();
        this.initEventListeners();
        
        this.detectVisibleSection = () => {};
    }

    readyPanels() {
        this.panels = {
            story: new StoryPanel(this.core),
            news: new NewsPanel(this.core),
            settings: new SettingsPanel(this.core),
            industry: new IndustryPanel(this.core),
        };

        this.initNavButtonFocusability();
    }

    boot() {
        setupGlobalBehavior(this.core);
        this.tooltipService = createTooltipService(this.core);
        this.contextMenuService = createContextMenuService(this.core, this.tooltipService);
        this.tooltipService.setContextMenuService(this.contextMenuService);
        this.showPanels();
        this.updateMobileNavArrows();
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
        const addNudgeListener = (el) => el.addEventListener("pointerdown", () => el.classList.add("nudged"));
        const addRippleListener = (el) => el.addEventListener("pointerdown", (e) => spawnRipple(e, el));

        document.querySelectorAll(".nudge").forEach(addNudgeListener);
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        document.querySelectorAll(".ripples").forEach(addRippleListener);

        const interactiveObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    
                    if (node.classList.contains("nudge")) {
                        addNudgeListener(node);
                    }
                    if (node.classList.contains("ripples")) {
                        node.addEventListener("click", (e) => spawnRipple(e, node));
                    }

                    node.querySelectorAll?.(".nudge").forEach(addNudgeListener);
                    node.querySelectorAll?.(".ripples").forEach(el => {
                        el.addEventListener("click", (e) => spawnRipple(e, el));
                    });
                });
            });
        });

        interactiveObserver.observe(document.body, {
            childList: true, subtree: true
        });

        const updateStoryScroll = () => verticalScroll(this.story, 5, true);

        this.story.addEventListener("scroll", updateStoryScroll);
        window.addEventListener("resize", updateStoryScroll);
    }


    show(loc, panel) {
        if (!this.activePanels[loc]|| !panel) return;

        for (const panelName in this.panels) {
            if (this.panels[panelName] && typeof this.panels[panelName].updateVisibility === 'function') {
                this.panels[panelName].updateVisibility(loc, panel);
            }
        }

        this.activePanels[loc] = panel;

        document.querySelectorAll(`.navbutton.chosen[data-loc='${loc}']`).forEach(el => el.classList.remove("chosen"));
        const button = document.querySelector(`.navbutton[data-panel='${panel}']`);
        if (button) {
            button.classList.add("chosen");
        }

        this.detectVisibleSection();
    }

    showPanels() {
        Object.entries(this.activePanels).forEach(([loc, panel]) => {
            this.show(loc, panel);
        });
    }

    createRenderInterval(fn) {
        const interval = setInterval(fn, this.core.settings.refreshUI);
        this.renderLoops.push({interval, fn});
        return interval;
    }

    destroyRenderInterval(interval) {
        const index = this.renderLoops.findIndex(loop => loop.interval === interval);
        if (index !== -1) {
            clearInterval(interval);
            this.renderLoops.splice(index, 1);
        }
    }

    initNavButtonFocusability() {
        const updateFocusability = (navButton) => {
            navButton.tabIndex = navButton.classList.contains('locked') ? -1 : 0;
        };

        document.querySelectorAll('.navbutton').forEach(updateFocusability);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('navbutton')) updateFocusability(target);
                }
            });
        });

        document.querySelectorAll('.navbutton').forEach(button => {
            observer.observe(button, { attributes: true, attributeFilter: ['class'] });
        });
    }

    updateRenderIntervals() {
        this.renderLoops.forEach(loop => {
            clearInterval(loop.interval);
            loop.interval = setInterval(loop.fn, this.core.settings.refreshUI);
        });
    }

    formatNumber(val, opt = {}) {
        return baseFormatNumber(val, this.core.settings.configs.numformat, opt);
    }

    serialize() {
        return {activePanels: this.activePanels, visibleSection: this.visibleSection};
    }

    deserialize(data) {
        this.activePanels = data.activePanels;
        this.visibleSection = data.visibleSection;
    }

    updateMobileNavArrows() {
        const sectionOrder = ["left", "center", "right"];
        const currentIndex = sectionOrder.indexOf(this.visibleSection);
        if (currentIndex === -1) return;

        const arrows = {
            left: [
                { id: "nav-arrow-left", disabled: currentIndex === 0 },
                { id: "nav-arrow-center-from-right", disabled: currentIndex !== 1 },
                { id: "nav-arrow-right-from-left", disabled: currentIndex !== 2 }
            ],
            right: [
                { id: "nav-arrow-center-from-left", disabled: currentIndex !== 0 },
                { id: "nav-arrow-right-from-center", disabled: currentIndex !== 1 },
                { id: "nav-arrow-right", disabled: currentIndex === 2 }
            ]
        };

        [...arrows.left, ...arrows.right].forEach(({ id, disabled }) => {
            const arrow = document.getElementById(id);
            if (arrow) arrow.disabled = disabled;
        });
    }

    hookTip(el, tipKey) {
        if (!el || !tipKey) return;
        const tips = (el.dataset.tips || '').split('@').filter(Boolean);
        if (!tips.includes(tipKey)) {
            tips.push(tipKey);
            el.dataset.tips = tips.join('@');
            el.classList.add('hastip');
        }
    }

    unhookTip(el, tipKey) {
        if (!el || !tipKey) return;
        const tips = el.dataset.tips?.split('@').filter(t => t && t !== tipKey);
        if (tips?.length) {
            el.dataset.tips = tips.join('@');
        } else {
            delete el.dataset.tips;
            el.classList.remove('hastip');
        }
    }
}
