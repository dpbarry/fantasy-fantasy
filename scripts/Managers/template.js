export default class Manager {
    #panel;
    #loops = {};

    constructor(core) {
        this.core = core;
    }

    set panel(sub) {
        this.#panel = sub;
    }

    broadcastPanel() {
        
    }

    getData() {
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