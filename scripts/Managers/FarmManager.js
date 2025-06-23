export default class FarmManager {
    #subscribers = [];
    #loops = {};

    constructor(core) {
        this.core = core;
    }

    onUpdate(callback) {
        this.#subscribers.push(callback);
    }

    broadcast() {
        this.#subscribers.forEach(cb => {
            cb(this.getStatus());
        });
    }

    getStatus() {
        return {...this};
    }

    run() {
        if (this.core.ui.activePanels["center"] === "farm" && !this.#loops.farm) {
            this.#loops.farm = setInterval(() => {
                this.broadcast();
            }, parseInt(this.core.settings.configs.refreshUI));
        } else {
            clearTimeout(this.#loops.loops);
            this.#loops.loops = null;
        }
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    boot() {
        this.run();
    }
}