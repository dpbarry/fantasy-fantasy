export default class CityManager {
    #loops = {};

    cityInfoAccess = {
        header: false
    };

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
        this.core.ui.panels.cityinfo.render(this.getStatus());
    }

    getStatus() {
        return { ...this};
    }

    updateLoops() {
        if (this.core.ui.activePanels["right"] === "cityinfo" && !this.#loops.cityInfo) {
            this.#loops.cityInfo = setInterval(() => {
                this.broadcast();
            }, parseInt(this.core.settings.configs.refreshUI));
        } else if(this.core.ui.activePanels["right"] !== "cityinfo") {
            clearTimeout(this.#loops.cityInfo);
            this.#loops.cityInfo = null;
        }
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }
}