import {unlockPanel} from "../Utils.js";

export default class UserManager {
    firstName = "";
    lastName = "";
    gender = "";
    savvy = 0;
    valor = 0;
    wisdom = 0;
    morality = 0;

    statusAccess = {
        name: false, date: false,
    };

    bonds = {
        tercius: 0, daphna: 0,
    };

    #npcSubtitles = {
        tercius: "The castle’s butler. He is duly mannered, but has a wry side.",
        daphna: "The castle’s chef. She refuses to put up with any type of nonsense."
    }

    #subscriber = () => {
    };

    constructor(core) {
        this.core = core;
        this.npcTooltips();
    }

    npcTooltips() {
        Object.keys(this.bonds).forEach((npc) => {
            this.core.ui.tooltipService.registerTip(npc, () => {
                return `<p><i>${this.#npcSubtitles[npc]}</i></p> <p><span class="bondWord term">Bond</span>: ${this.bonds[npc]}%</p>`
            });
        })
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
        return {...this};
    }

    genderSwitch(male, female) {
        return this.gender === "M" ? male : female;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (Object.values(this.statusAccess).some(x => x)) {
            let lock = this.core.ui.userstatus.querySelector(".lock");
            if (lock) lock.remove();
        }
        this.#subscriber(this.getStatus());
    }
}
