export default class CityManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('city', this);
    }
    serialize() {

    }

    deserialize(data) {

    }
}