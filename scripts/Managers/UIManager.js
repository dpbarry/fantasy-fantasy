import createTooltipService from "../UI/Services/TooltipService.js";
import setupKeyboard from "../UI/Components/Keyboard.js";
import setupGlobalBehavior from "../UI/Services/GlobalBehavior.js";
import {verticalScroll} from "../Utils.js";
import StoryScreen from "../UI/Screens/StoryScreen.js";
import NewsPanel from "../UI/Chrome/NewsPanel.js";
import UserStatus from "../UI/Chrome/UserStatus.js";
import CityInfo from "../UI/Chrome/CityInfo.js";

export default class UIManager {
    constructor(core) {
        this.core = core;

        this.tooltipService = createTooltipService(core);
        this.activePanels = {
            "right": "cityinfo",
            "main": "story",
            "left": "team",
        }
        this.visibleSection = "center";

        this.initialize();
    }

    // after initialization so that the necessary managers are formed
    readyScreens() {
        this.screens = {
            story: new StoryScreen(this.core),
        };

        this.panels = {
            news: new NewsPanel(this.core),
            userstatus: new UserStatus(this.core),
            cityinfo: new CityInfo(this.core),
        }
    }

    boot() {
        setupGlobalBehavior(this.core);
        this.showPanels();
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.userstatus = document.getElementById("user-status");

        this.rightbar = document.getElementById("right-wrap");
        this.cityinfo = document.getElementById("cityinfo");
        this.leftbar = document.getElementById("left-wrap");
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
        this.activePanels[loc] = panel;
        document.querySelectorAll(`#navbar .chosen[data-loc='${loc}']`).forEach(el => el.classList.remove("chosen"));
        let button = document.querySelector(`button[data-panel='${panel}'].navbutton:not(.locked)`);
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
        return {activeScreen: this.activeScreen, activePanels: this.activePanels, visibleSection: this.visibleSection};
    }

    deserialize(data) {
        this.activeScreen = data.activeScreen;
        this.activePanels = data.activePanels;
        this.visibleSection = data.visibleSection;
    }

    updateAccess() {
    }
}
