import createTooltipService from "../UI/Services/TooltipService.js";
import setupKeyboard from "../UI/components/Keyboard.js";
import setupGlobalBehavior from "../UI/Services/GlobalBehavior.js";
import {verticalScroll} from "../Utils.js";
import StoryScreen from "../UI/Screens/StoryScreen.js";
import NewsPanel from "../UI/Chrome/NewsPanel.js";
import UserStatus from "../UI/Chrome/UserStatus.js";

export default class UIManager {
    constructor(core) {
        this.core = core;

        this.tooltipService = createTooltipService(core);
        this.activeScreen = "story";

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
        }
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.userstatus = document.getElementById("user-status");
    }

    initialize() {
        this.tooltipService.initialize(this.core);
        setupGlobalBehavior(this.core);
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


    show(screen) {
        this.activeScreen = screen;
        document.querySelectorAll("#navbar .chosen").forEach(el => el.classList.remove("chosen"));
        document.querySelector(`#navbar button[data-panel='${screen}']`).classList.add("chosen");
    }

    serialize() {
        return {activeScreen: this.activeScreen};
    }

    deserialize(data) {
        this.activeScreen = data.activeScreen;
    }

    updateAccess() {
    }
}
