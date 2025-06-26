import {applyTheme} from "../Services/GlobalBehavior.js";

export default class SettingsManager {
    configs = {
        background: "black",
        accent: "amber",
        refreshUI: "30",
    }


    constructor(core) {
        this.core = core;
    }

    broadcast() {
        this.core.ui.panels.settings.render(this.getStatus());
    }

    getStatus() {
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