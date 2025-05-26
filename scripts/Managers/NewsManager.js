export default class NewsManager {
    logs = [];
    #subscribers = [];

    constructor(core) {
        this.core = core;
    }

    onUpdate(callback) {
        this.#subscribers.push(callback);
    }

    broadcast() {
        this.#subscribers.forEach(cb => {
            cb(this.getLogs());
        });
    }
    
    update(message) {
        const timestamp = this.core.clock.gameTime({format: "short"});
        this.logs.push({timestamp, message});
        this.broadcast();
    }

    getLogs() {
        return this.logs;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (!this.logs.length) return;
        let lock = this.core.ui.news.querySelector(".lock");
        if (lock) lock.remove();
        this.broadcast();
    }
}