import {applyTheme} from "../UI/Services/GlobalBehavior.js";

export default class SettingsManager {
    configs = {
        background: "black",
        accent: "amber",
        refreshUI: "30",
    }
    #subscribers = [];

    constructor(core) {
        this.core = core;
    }

    onUpdate(callback) {
        this.#subscribers.push(callback);
    }

    broadcast() {
        this.#subscribers.forEach(cb => {
            cb(this.getSettings());
        });
    }

    getSettings() {
        return this.configs;
    }

    updateSetting(setting, value) {
        this.configs[setting] = value;
        applyTheme(this.core);
        this.broadcast();
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    boot() {
        this.broadcast();
    }
    
    earlyInit() {
        applyTheme(this.core);
    }
}