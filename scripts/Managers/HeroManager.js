export default class HeroManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('hero', this);
    }
    serialize() {

    }

    deserialize(data) {

    }
}
