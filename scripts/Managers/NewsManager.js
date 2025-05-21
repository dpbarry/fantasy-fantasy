import GeneralService from "../Services/GeneralService.js";

export default class NewsManager {
    constructor(core) {
        this.core = core;
        this.notifs = "";
        this.logGrid = this.core.ui.news.querySelector('#wrapupdates');
        this.logGrid.addEventListener('scroll', () => {
            GeneralService.verticalScroll(this.logGrid, 2);
        });
        window.addEventListener("resize", () => {
            GeneralService.verticalScroll( this.logGrid, 2);
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
        this.logGrid.appendChild(timeEl);
        this.logGrid.appendChild(msgEl);

        timeEl.ontransitionend = () => GeneralService.verticalScroll(this.logGrid, 2);
    }
    
    serialize() {
        return {
            logs: this.logGrid.innerHTML
        };
    }

    deserialize(data) {
        this.core.ui.news.querySelector(".lockedpanel").remove();
        this.logGrid.innerHTML = data.logs;
    }
}