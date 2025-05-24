export default class NewsManager {
    logs = [];
    #subscriber = () => {
    };

    constructor(core) {
        this.core = core;
    }

    onUpdate(callback) {
        this.#subscriber = callback;
    }

    update(message) {
        const timestamp = this.core.clock.gameTime({format: "short"});
        this.logs.push({timestamp, message});
        this.#subscriber(this.logs);
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
        let lock = this.core.ui.news.querySelector(".lockedpanel");
        if (lock) lock.remove();
        this.#subscriber(this.logs);
    }
}