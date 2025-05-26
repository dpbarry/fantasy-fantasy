import {unlockPanel} from "../Utils.js";

export default class CityManager {
    #subscribers = [];
    #running = false;

    cityInfoAccess = {
        header: false
    };

    constructor(core) {
        this.core = core;
        this.name = "";
        this.level = 1;
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

    getStatus() {
        return {...this};
    }

    unlockCityHeader(pName) {
        this.name = pName;
        this.cityInfoAccess.header = true;
        unlockPanel(this.core.ui.cityinfo.querySelector("#cityinfo")).then(() => {
            this.core.ui.show("right", "cityinfo")
        });
    }

    run() {
        if (this.core.ui.activePanels["right"] !== "cityinfo") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;

        this.broadcast();
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
        this.run();
    }

    updateAccess() {
        if (Object.values(this.cityInfoAccess).some(x => x)) {
            let lock = this.core.ui.cityinfo.querySelector(".lock");
            if (lock) lock.remove();
        }
    }

}