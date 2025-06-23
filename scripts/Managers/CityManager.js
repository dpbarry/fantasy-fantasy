export default class CityManager {
    #subscribers = [];
    #loops = {};

    cityInfoAccess = {
        header: false
    };

    constructor(core) {
        this.core = core;
        this.name = "";
        this.level = 1;
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
        if (this.core.ui.activePanels["right"] === "cityinfo" && !this.#loops.cityInfo) {
            this.#loops.cityInfo = setInterval(() => {
                this.broadcast();
            }, parseInt(this.core.settings.configs.refreshUI));
        } else {
            clearTimeout(this.#loops.cityInfo);
            this.#loops.cityInfo = null;
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