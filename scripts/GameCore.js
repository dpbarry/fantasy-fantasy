import ClockManager from './Managers/ClockManager.js';
import GameStorage from './GameStorage.js';
import UIManager from "./Managers/UIManager.js";
import StoryManager from "./Managers/StoryManager.js";
import CityManager from "./Managers/CityManager.js";
import HeroManager from "./Managers/HeroManager.js";
import UserManager from "./Managers/UserManager.js";
import NewsManager from "./Managers/NewsManager.js";
import HackService from "./UI/Services/HackService.js";
import LoadingService from "./UI/Services/LoadingService.js";
import SaveManager from "./Managers/SaveManager.js";

export default class GameCore {
    static #instance = null;
    #lastFrameTime;
    #isRunning;
    #lastSaveTime;
    #saveThrottleMS;
    #pendingSave;
    #saveableComponents;
    #currentVersion = "0.0.8";


    constructor() {
        if (GameCore.#instance) {
            throw new Error("Use GameCore.getInstance()");
        }
        GameCore.#instance = this;

        this.#lastFrameTime = 0;
        this.#isRunning = false;

        // Save throttling
        this.#lastSaveTime = 0;
        this.#saveThrottleMS = 1000;
        this.#pendingSave = false;

        this.#saveableComponents = new Map();

        this.storage = new GameStorage(this);

        // These managers are required in some constructors of the others
        this.clock = new ClockManager(this);
        this.ui = new UIManager(this);

        this.managers = {
            ui: this.ui,
            clock: this.clock,
            story: new StoryManager(this),
            city: new CityManager(this),
            heroes: new HeroManager(this),
            mc: new UserManager(this),
            news: new NewsManager(this),
            saves: new SaveManager(this),
        };
        Object.entries(this.managers).forEach(([k, m]) => {
            this[k] = m;
            if (typeof m.serialize === "function" && typeof m.deserialize === "function" && typeof m.updateAccess === "function") {
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

    static getInstance() {
        if (!GameCore.#instance) {
            GameCore.#instance = new GameCore();
        }
        return GameCore.#instance;
    }

    async #initializeGame() {
        HackService.initialize(this);
        this.ui.readyPanels();
        await LoadingService.initialize();
        await this.loadLastSave();
        this.managers.story.run();
        await LoadingService.hide();
        this.ui.boot();

        this.#isRunning = true;
        this.#lastFrameTime = performance.now();
        this.gameLoop(this.#lastFrameTime);

        window.onbeforeunload = () => {
            this.save();
        };
    }

    gameLoop(currentTime) {
        if (!this.#isRunning) return;

        const frameTime = (currentTime - this.#lastFrameTime) / 1000;
        this.#lastFrameTime = currentTime;

        this.clock.advance(frameTime);


        const now = Date.now();
        if (!this.#pendingSave && now - this.#lastSaveTime >= this.#saveThrottleMS) {
            this.#pendingSave = true;
            this.save().finally(() => {
                this.#lastSaveTime = Date.now();
                this.#pendingSave = false;
            });
        }

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    pause() {
        this.#isRunning = false;
    }

    resume() {
        if (!this.#isRunning) {
            this.#isRunning = true;
            this.#lastFrameTime = performance.now();
            this.gameLoop(this.#lastFrameTime);
        }
    }

    async save() {
        try {
            const componentsData = {};
            for (const [key, component] of this.#saveableComponents) {
                componentsData[key] = component.serialize();
            }

            const snapshot = {
                version: this.#currentVersion, timestamp: Date.now(), data: componentsData
            };

            await this.storage.save(snapshot);
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    }

    async loadLastSave() {
        try {
            const snapshot = await this.storage.load();
            if (!snapshot) return false;

            if (snapshot.version !== this.#currentVersion) {
                console.warn(`Save version ${snapshot.version} not supported (want ${this.#currentVersion}). Resetting...`);
                return false;
            }

            for (const [key, component] of this.#saveableComponents) {
                if (snapshot.data[key]) {
                    component.deserialize(snapshot.data[key]);
                    component.updateAccess();
                } else {
                    console.warn(`No saved data found for component: ${key}`);
                }
            }

            return true;
        } catch (error) {
            console.error('Load failed:', error);
            return false;
        }
    }
}