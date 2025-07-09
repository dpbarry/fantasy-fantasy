export default class CityManager {
    #loops = {};

    ruler = {
        firstName: "",
        lastName: "",
        gender: "",
        savvy: 0,
        valor: 0,
        wisdom: 0
    };

    constructor(core) {
        this.core = core;
        this.name = "";
        this.level = 1;
    }

    setRulerName(firstName, lastName) {
        this.ruler.firstName = firstName;
        this.ruler.lastName = lastName;
    }

    genderSwitch(male, female) {
        return this.ruler.gender === "M" ? male : female;
    }

    broadcast() {
    }

    getStatus() {
        return { ...this};
    }

    updateLoops() {

    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }
}