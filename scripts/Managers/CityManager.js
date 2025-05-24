export default class CityManager {
    constructor(core) {
        this.core = core;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {}

}