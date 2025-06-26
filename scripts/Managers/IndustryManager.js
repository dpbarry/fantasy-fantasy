import Decimal from "../Services/break_infinity.esm.js";

export default class IndustryManager {
    #loops = {};

    constructor(core) {
        this.core = core;
        this.access = {
            basic: false,
        };
        
       this.resources = {
           gold: new Decimal(),
       }
    }

    broadcast() {
        this.core.ui.panels.industry.render();
    }

    getStatus() {
        return {...this};
    }

    run() {
        if (this.core.ui.activePanels["center"] === "industry" && !this.#loops.industry) {
            this.#loops.industry = setInterval(() => {
                this.broadcast();
            }, parseInt(this.core.settings.configs.refreshUI));
        } else {
            clearTimeout(this.#loops.loops);
            this.#loops.loops = null;
        }
    }
    
    tick(dt) {

    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    boot() {
        if (this.access.basic) {
            document.querySelector("#industrynav").classList.remove("locked");
        }
        this.run();
    }
}