export default class UserManager {
    firstName = "";
    lastName = "";
    gender = "";
    savvy = 0;
    valor = 0;
    wisdom = 0;


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
