import { unlockPanel } from "../Utils.js";

export default class UserManager {
    firstName = "";
    lastName = "";
    gender = "";
    savvy = 0;
    valor = 0;
    wisdom = 0;
    morality = 0;

    statusAccess = {
        name: false,
        date: false,
    };

    #subscriber = () => {};

    constructor(core) {
        this.core = core;
    }

    onUpdate(callback) {
        this.#subscriber = callback;
    }

    unlockStatus(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.statusAccess.name = true;
        this.statusAccess.date = true;
        unlockPanel(this.core.ui.userstatus).then(() => {
            this.#subscriber(this.getStatus());
        });
    }

    getStatus() {
        return {
            firstName: this.firstName,
            lastName: this.lastName,
            gender: this.gender,
            savvy: this.savvy,
            valor: this.valor,
            wisdom: this.wisdom,
            morality: this.morality,
            statusAccess: { ...this.statusAccess },
            gameDate: this.core.clock ? this.core.clock.gameDate({ format: "numeric" }) : null,
            season: this.core.clock ? this.core.clock.getSeason() : null,
        };
    }

    genderSwitch(male, female) {
        return this.gender === "M" ? male : female;
    }

    serialize() {
        const { core, ...rest } = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
        this.#subscriber(this.getStatus());
    }

    updateAccess() {
        if (Object.values(this.statusAccess).some(x => x)) {
            let lock = this.core.ui.userstatus.querySelector(".lockedpanel");
            if (lock) lock.remove();
        }
        this.#subscriber(this.getStatus());
    }
}
