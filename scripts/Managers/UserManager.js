export default class UserManager {
    firstName = "";
    lastName = "";
    gender = "";
    savvy = 0;
    valor = 0;
    wisdom = 0;

    quickAccess = false;

    #subscribers = [];

    constructor(core) {
        this.core = core;
        core.clock.subscribeRealTime(() => this.run(), {interval: 1});
    }

    onUpdate(callback) {
        this.#subscribers.push(callback);
    }

    broadcast() {
        this.#subscribers.forEach(cb => {
            cb(this.getStatus());
        });
    }

    setName(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
    }

    getStatus() {
        return {...this};
    }

    genderSwitch(male, female) {
        return this.gender === "M" ? male : female;
    }

    run() {
        this.broadcast();
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (this.quickAccess) {
            let lock = this.core.ui.quickacc.querySelector(".lock");
            if (lock) lock.remove();
        }
        this.run();
    }
}
