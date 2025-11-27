import {applyTheme} from "../Services/GlobalBehavior.js";

export default class SettingsManager {
    configs = {
        background: "dark",
        accent: "lightning",
        refreshUI: "30",
        offlineprogress: "on",
    }


    constructor(core) {
        this.core = core;
    }

    broadcast() {
        this.core.ui.panels.settings.render(this.getData());
    }

    getData() {
        return this.configs;
    }

    get refreshUI() {
        return 1000 / parseInt(this.configs.refreshUI);
    }

    updateSetting(setting, value) {
        this.configs[setting] = value;
        if (setting === "background" || setting === "accent") applyTheme(this.core);
        if (setting === "refreshUI") this.core.ui.updateRenderIntervals();
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