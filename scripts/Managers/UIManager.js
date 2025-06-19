import createTooltipService from "../UI/Services/TooltipService.js";
import setupKeyboard from "../UI/Components/Keyboard.js";
import setupGlobalBehavior from "../UI/Services/GlobalBehavior.js";
import {verticalScroll} from "../Utils.js";
import StoryPanel from "../UI/Panels/StoryPanel.js";
import NewsPanel from "../UI/Panels/NewsPanel.js";
import QuickAccess from "../UI/Chrome/QuickAccess.js";
import CityInfoPanel from "../UI/Panels/CityInfoPanel.js";
import SettingsPanel from "../UI/Panels/SettingsPanel.js";

export default class UIManager {
    constructor(core) {
        this.core = core;

        this.tooltipService = createTooltipService(core);
        this.activePanels = {
            "left": "",
            "center": "story",
            "right": "settings",
        }
        this.visibleSection = "center";

        this.initialize();
    }

    // after initialization so that the necessary managers are formed
    readyPanels() {
        this.panels = {
            story: new StoryPanel(this.core),
            news: new NewsPanel(this.core),
            quickacc: new QuickAccess(this.core),
            cityinfo: new CityInfoPanel(this.core),
            settings: new SettingsPanel(this.core),
        }
    }

    boot() {
        setupGlobalBehavior(this.core);
        this.showPanels();
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.quickacc = document.getElementById("quick-access");

        this.left = document.getElementById("left");
        this.center = document.getElementById("center");
        this.right = document.getElementById("right");

        this.cityinfo = document.getElementById("cityinfo");
        this.settings = document.getElementById("settings");
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
            b.onpointerdown = () => this.show(b.dataset.panel);
        });
    }

    initEventListeners() {
        document.querySelectorAll(".nudge").forEach(b => b.addEventListener("pointerdown", () => b.classList.add("nudged")));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        setupKeyboard();
        this.story.addEventListener("scroll", () => {
            verticalScroll(this.story, 5, true);
        });
        window.addEventListener("resize", () => {
            verticalScroll(this.story, 5, true);
        });
    }


    show(loc, panel) {
        if (this.activePanels[loc])
            this.activePanels[loc] = panel;
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

    serialize() {
        return {activePanels: this.activePanels, visibleSection: this.visibleSection};
    }

    deserialize(data) {
        this.activePanels = data.activePanels;
        this.visibleSection = data.visibleSection;
    }
}
