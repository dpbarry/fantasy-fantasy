export default class CityManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('city', this);
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