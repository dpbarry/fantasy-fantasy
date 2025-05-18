import GeneralService from "../Services/GeneralService.js";

export default class NewsManager {
    constructor(core) {
        this.core = core;
        this.notifs = "";
        core.registerSaveableComponent('news', this);
    }
    update(msg) {
        // If this is the first update, create the grid container
        if (!this.core.ui.news.querySelector('.wrapupdates')) {
            const grid = document.createElement('div');
            grid.className = 'wrapupdates';
            grid.dataset.masksize = '10';
            grid.addEventListener('scroll', () => {
                GeneralService.verticalScroll(grid, 2);
            });
            this.core.ui.news.appendChild(grid);
        }

        const grid = this.core.ui.news.querySelector('.wrapupdates');

        const timeEl = document.createElement('div');
        timeEl.className = 'timestamp';
        timeEl.innerText = this.core.clock.gameTime({format: "short"});

        const msgEl = document.createElement('div');
        msgEl.className = 'message';
        msgEl.innerText = msg;

        // Add both elements to the grid
        grid.appendChild(timeEl);
        grid.appendChild(msgEl);

        timeEl.ontransitionend = () => GeneralService.verticalScroll(grid, 2);
    }

    renderNews() {
        this.core.ui.news.innerHTML = this.notifs;
    }

    serialize() {
        return {
            notifs: this.core.ui.news.innerHTML
        };
    }

    deserialize(data) {
        this.core.ui.news.innerHTML = data.notifs;
    }
}