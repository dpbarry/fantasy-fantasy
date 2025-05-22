export default class HeroManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('hero', this);
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
