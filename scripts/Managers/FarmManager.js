export default class FarmManager {
    #subscribers = [];
    #running = false;

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
        if (this.core.ui.activePanels["center"] !== "farm") {
            this.#running = false;
            return;
        }
        this.run();
    }
}