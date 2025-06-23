export default class FarmManager {
    #loops = {};

    constructor(core) {
        this.core = core;
    }

    broadcast() {
        this.core.ui.panels.farm.render();
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