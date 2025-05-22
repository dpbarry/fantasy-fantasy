import GeneralService from "../Services/GeneralService.js";

export default class NewsManager {
    #logGrid;
    constructor(core) {
        this.core = core;
        this.notifs = "";
        this.logs = "";
        this.#logGrid = this.core.ui.news.querySelector('#wrapupdates');
        
        this.#logGrid.addEventListener('scroll', () => {
            GeneralService.verticalScroll(this.#logGrid, 2);
        });
        window.addEventListener("resize", () => {
            GeneralService.verticalScroll( this.#logGrid, 2);
        });
        core.registerSaveableComponent('news', this);
    }

    update(msg) {
        const timeEl = document.createElement('div');
        timeEl.className = 'timestamp';
        timeEl.innerText = this.core.clock.gameTime({format: "short"});

        const msgEl = document.createElement('div');
        msgEl.className = 'message';
        msgEl.innerText = msg;

        // Add both elements to the grid
        this.#logGrid.appendChild(timeEl);
        this.#logGrid.appendChild(msgEl);

        this.logs = this.#logGrid.innerHTML;

        timeEl.ontransitionend = () => GeneralService.verticalScroll(this.#logGrid, 2);
    }
    
    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (!this.logs) return;
        this.core.ui.news.querySelector(".lockedpanel").remove();
        this.#logGrid.innerHTML = this.logs;
    }
}