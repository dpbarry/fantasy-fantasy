export default class HeroManager {
    #loops = {};

    constructor(core) {
        this.core = core;
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