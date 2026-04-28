import ClockManager from './Managers/ClockManager.js';
import GameStorage from './GameStorage.js';
import UIManager from "./Managers/UIManager.js";
import StoryManager from "./Managers/StoryManager.js";
import CityManager from "./Managers/CityManager.js";
import HeroManager from "./Managers/HeroManager.js";
import NewsManager from "./Managers/NewsManager.js";
import HackService from "./Services/HackService.js";
import LoadingService from "./Services/LoadingService.js";
import SettingsManager from "./Managers/SettingsManager.js";
import IndustryManager from "./Managers/IndustryManager.js";

export default class GameCore {
    static #instance = null;
    static RuntimeModes = Object.freeze({
        BOOTING: "booting",
        RUNNING: "running",
        PAUSED: "paused",
        PROLOGUE: "prologue",
    });

    #lastFrameTime;
    #isRunning;
    #lastSaveTime;
    #saveThrottleMS;
    #pendingSave;
    #saveableComponents;
    #currentVersion = "0.2.1";
    #runtimeMode;


    constructor() {
        if (GameCore.#instance) {
            throw new Error("Use GameCore.getInstance()");
        }
        GameCore.#instance = this;

        this.#lastFrameTime = 0;
        this.#isRunning = false;
        this.#runtimeMode = GameCore.RuntimeModes.BOOTING;

        this.#lastSaveTime = 0;
        this.#saveThrottleMS = 1000;
        this.#pendingSave = false;

        this.#saveableComponents = new Map();

        this.storage = new GameStorage(this);

        this.clock = new ClockManager(this);
        this.ui = new UIManager(this);

        this.managers = {
            ui: this.ui,
            clock: this.clock,
            story: new StoryManager(this),
            city: new CityManager(this),
            industry: new IndustryManager(this),
            heroes: new HeroManager(this),
            news: new NewsManager(this),
            settings: new SettingsManager(this),
        };

        Object.entries(this.managers).forEach(([k, m]) => {
            this[k] = m;
            if (typeof m.serialize === "function" && typeof m.deserialize === "function") {
                this.#saveableComponents.set(k, m);
            }
        });

        this.#initializeGame();
    }

    get saveableComponents() {
        return this.#saveableComponents;
    }

    get currentVersion() {
        return this.#currentVersion;
    }

    get pendingSave() {
        return this.#pendingSave;
    }

    get isRunning() {
        return this.#isRunning;
    }

    get runtimeMode() {
        return this.#runtimeMode;
    }

    static getInstance() {
        if (!GameCore.#instance) {
            GameCore.#instance = new GameCore();
        }
        return GameCore.#instance;
    }

    async #initializeGame() {
        HackService.initialize(this);
        this.ui.readyPanels();
        await this.storage.loadFullGame(this);
        this.story.syncPrologueStateFromProgress();
        this.managers.settings.earlyInit();
        await LoadingService.initialize();
        Object.values(this.managers).forEach(m => {
            if (typeof m.boot === "function") m.boot();
        })
        await LoadingService.hide();

        document.body.focus();

        this.setRuntimeMode(GameCore.RuntimeModes.RUNNING);
        this.#isRunning = true;
        this.#lastFrameTime = performance.now();
        this.gameLoop(this.#lastFrameTime);

        window.onbeforeunload = () => {
            this.storage.saveFullGame(this);
        };
    }

    gameLoop(currentTime) {
        if (!this.#isRunning) return;

        const frameTime = (currentTime - this.#lastFrameTime) / 1000;
        this.#lastFrameTime = currentTime;

        if (this.#runtimeMode === GameCore.RuntimeModes.RUNNING) {
            this.clock.advance(frameTime);
            this.industry.tick(frameTime);

            const now = Date.now();
            if (!this.#pendingSave && now - this.#lastSaveTime >= this.#saveThrottleMS) {
                this.#pendingSave = true;
                this.storage.saveFullGame(this).finally(() => {
                    this.#lastSaveTime = Date.now();
                    this.#pendingSave = false;
                });
            }
        }

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    setRuntimeMode(mode) {
        const valid = Object.values(GameCore.RuntimeModes);
        if (!valid.includes(mode)) return false;
        this.#runtimeMode = mode;
        if (mode === GameCore.RuntimeModes.RUNNING) {
            this.clock.resume();
        } else {
            this.clock.pause();
        }
        return true;
    }

    pause() {
        this.setRuntimeMode(GameCore.RuntimeModes.PAUSED);
        this.#isRunning = false;
    }

    resume() {
        if (!this.#isRunning) {
            if (this.#runtimeMode === GameCore.RuntimeModes.PAUSED) {
                this.setRuntimeMode(GameCore.RuntimeModes.RUNNING);
            }
            this.#isRunning = true;
            this.#lastFrameTime = performance.now();
            this.gameLoop(this.#lastFrameTime);
        }
    }
}