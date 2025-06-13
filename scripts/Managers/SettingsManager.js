export default class SettingsManager {
    settings = {
        bgTheme: "black",
        bgAccent: "lightning",
        refreshUI: "500",
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
        return this.settings;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        this.broadcast();
    }
}