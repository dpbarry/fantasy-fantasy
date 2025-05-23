// core/GameCore.js
import GameClock from './GameClock.js';
import GameStorage from './GameStorage.js';
import GameUI from "./Managers/GameUI.js";
import StoryManager from "./Managers/StoryManager.js";
import CityManager from "./Managers/CityManager.js";
import HeroManager from "./Managers/HeroManager.js";
import UserManager from "./Managers/UserManager.js";
import NewsManager from "./Managers/NewsManager.js";
import HackService from "./Services/HackService.js";
import LoadingService from "./Services/LoadingService.js";

export default class GameCore {
    static #instance = null;
    #tickListeners;
    #lastFrameTime;
    #isRunning;
    #lastSaveTime;
    #saveThrottleMS;
    #pendingSave;
    #saveableComponents;
    #currentVersion = "0.0.2";

    constructor() {
        if (GameCore.#instance) return GameCore.#instance;
        GameCore.#instance = this;

        this.#lastFrameTime = 0;
        this.#isRunning = false;

        // Save throttling
        this.#lastSaveTime = 0;
        this.#saveThrottleMS = 1000;
        this.#pendingSave = false;

        this.#saveableComponents = new Map();
        this.#tickListeners = new Set();
        
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
        this.clock = new GameClock();
        this.storage = new GameStorage();
        this.registerSaveableComponent('clock', this.clock);

        this.ui = new GameUI(this);
        this.heroes = new HeroManager(this);
        this.city = new CityManager(this);
        this.story = new StoryManager(this);
        this.mc = new UserManager(this);
        this.news = new NewsManager(this);
        HackService.initialize(this);
        this.activePanel = this.ui.story;


        await LoadingService.initialize();
        await this.loadLastSave();
        LoadingService.hide();
        
        this.ui.activatePanel(this.activePanel); // Story is default

        this.#isRunning = true;
        this.#lastFrameTime = performance.now();
        this.gameLoop(this.#lastFrameTime);

        window.onbeforeunload = () => {
            this.save();
        };
    }

    gameLoop(currentTime) {
        if (!this.#isRunning) return;

        const dt = (currentTime - this.#lastFrameTime) / 1000;
        this.#lastFrameTime = currentTime;

        this.clock.advance(dt);
        
        this.#tickListeners.forEach(listener => {
            listener();
        });

        // Handle throttled saving
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
    
    onTick(cb) {
        this.#tickListeners.add(cb);
    }

    pause() {
        this.#isRunning = false;
    }

    resume() {
        this.#isRunning = true;
    }

    registerSaveableComponent(key, component) {
        if (typeof component.serialize !== 'function' || typeof component.deserialize !== 'function' || typeof component.updateAccess !== 'function') {
            throw new Error(`Component ${key} must implement proper methods.`);
        }
        this.#saveableComponents.set(key, component);
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
                console.warn('Incompatible save version. Resetting.');
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