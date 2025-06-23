export default class UserManager {
    firstName = "";
    lastName = "";
    gender = "";
    savvy = 0;
    valor = 0;
    wisdom = 0;

    quickAccess = false;

    #loops = {};

    constructor(core) {
        this.core = core;
    }

    broadcast() {
       this.core.ui.panels.render(this.getStatus());
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
        if (this.quickAccess && !(this.#loops.quickAccess)) {
            this.#loops.quickAccess = setInterval(() => {
                this.broadcast();
            }, parseInt(this.core.settings.configs.refreshUI));
        } else {
            clearTimeout(this.#loops.quickAccess);
            this.#loops.quickAccess = null;
        }
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    boot() {
        if (this.quickAccess) {
            this.core.ui.quickacc.classList.add("shown");
        }
        this.run();
    }
}
