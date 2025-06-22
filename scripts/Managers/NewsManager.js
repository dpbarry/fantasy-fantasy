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
        const timestamp = (() => {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`
        })();
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

    boot() {
        if (!this.logs.length) return;
        this.core.ui.news.classList.add("shown");
        this.broadcast();
    }
}