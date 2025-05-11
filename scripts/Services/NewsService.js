import GeneralService from "./GeneralService.js";

export default class NewsService {
    static updateOn(el, msg, timestamp) {
        // If this is the first update, create the grid container
        if (!el.querySelector('.wrapupdates')) {
            const grid = document.createElement('div');
            grid.className = 'wrapupdates';
            grid.dataset.masksize = '10';
            grid.addEventListener('scroll', () => {
                GeneralService.verticalScroll(grid, 2);
            });
            el.appendChild(grid);
        }

        const grid = el.querySelector('.wrapupdates');

        const timeEl = document.createElement('div');
        timeEl.className = 'timestamp';
        timeEl.innerText = timestamp;

        const msgEl = document.createElement('div');
        msgEl.className = 'message';
        msgEl.innerText = msg;

        // Add both elements to the grid
        grid.appendChild(timeEl);
        grid.appendChild(msgEl);

        timeEl.ontransitionend = () => GeneralService.verticalScroll(grid, 2);
    }
}