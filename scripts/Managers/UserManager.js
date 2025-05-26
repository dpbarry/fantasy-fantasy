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
        name: false, date: false, bonds: false
    };

    bonds = {
        Tercius: 0, Daphna: 0,
    };

    #npcPersonalities = {
        Tercius: "The castle’s butler. He is duly mannered, but has a wry side.",
        Daphna: "The castle’s chef. She refuses to put up with any type of nonsense."
    }

    #subscribers = [];

    #bondRunning = false;

    get bondRunning() {return this.#bondRunning;}
    set bondRunning(v) {this.#bondRunning = v;}

    constructor(core) {
        this.core = core;
        this.npcTooltips();
        core.clock.subscribeRealTime(() => this.run(), {interval: 1});
    }

    npcTooltips() {
        Object.keys(this.bonds).forEach((npc) => {
            this.core.ui.tooltipService.registerTip(npc, () => {
                return `<p><i>${this.#npcPersonalities[npc]}</i></p> <p><span class="bondWord term">Bond</span>: ${this.bonds[npc]}%</p>`
            });
        })
    }

    onUpdate(callback) {
        this.#subscribers.push(callback);
    }

    broadcast() {
        this.#subscribers.forEach(cb => {
            cb(this.getStatus());
        });
    }

    unlockStatus(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.statusAccess.name = true;
        this.statusAccess.date = true;
        unlockPanel(this.core.ui.userstatus);
        this.broadcast();
    }

    unlockBonds() {
        this.statusAccess.bonds = true;
        this.broadcast();
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
        if (Object.values(this.statusAccess).some(x => x)) {
            let lock = this.core.ui.userstatus.querySelector(".lock");
            if (lock) lock.remove();
        }
        this.run();
    }
}
