import {unlockPanel} from "../Utils.js";

export default class CityManager {
    #subscriber = () => {
    };
    #running = false;

    cityInfoAccess = {
      header: false
    };

    constructor(core) {
        this.core = core;
        this.name = "";
        this.level = 1;
        core.onTick(() => this.runCityInfo());
    }

    onUpdate(cb) {
        this.#subscriber = cb;
    }

    getStatus() {
        return {...this};
    }

    unlockCityHeader(pName) {
        this.name = pName;
        this.cityInfoAccess.header = true;
        unlockPanel(this.core.ui.rightbar.querySelector("#cityinfo")).then(() => {
            this.core.ui.show("right", "cityinfo")
            this.#subscriber(this.getStatus());
        });
    }

    runCityInfo() {
        if (this.core.ui.activePanels["right"] !== "cityinfo") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;
        this.#subscriber(this.getStatus());
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (Object.values(this.cityInfoAccess).some(x => x)) {
            let lock = this.core.ui.cityinfo.querySelector(".lock");
            if (lock) lock.remove();
        }
    }

}