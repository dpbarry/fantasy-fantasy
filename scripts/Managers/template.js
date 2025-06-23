export default class Manager {
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