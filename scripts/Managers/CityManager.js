import {unlockPanel} from "../Utils.js";

export default class CityManager {
    #subscriber = () => {
    };
    #running = false;

    cityInfoAccess = {
        name: false, date: false,
    };

    constructor(core) {
        this.core = core;
        this.name = "";
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
        this.cityInfoAccess.name = true;
        this.cityInfoAccess.date = true;
        this.time = this.core.clock.gameTime({format: "full"});
        unlockPanel(this.core.ui.rightbar.querySelector("#cityinfo")).then(() => {
            this.core.ui.showPanel("rightbar", "cityinfo")
            this.#subscriber(this.getStatus());
        });
    }

    runCityInfo() {
        if (this.core.ui.activePanels["rightbar"] !== "cityinfo") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;
        this.#subscriber(this.getStatus());
        this.#subscriber(this.core.clock.gameTime({format: "full"}), "time");


        const updateTime = () => {
            if (!this.#running) {
                this.core.clock.unsubscribe(updateTime);
                return;
            }
            this.#subscriber(this.core.clock.gameTime({format: "full"}), "time");
        };

        this.core.clock.subscribeGameTime(updateTime, {interval: 1});
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