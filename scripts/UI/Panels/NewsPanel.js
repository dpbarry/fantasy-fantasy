import {verticalScroll} from "../../Utils.js";

export default class NewsPanel {
    #logs = [];

    constructor(core) {
        this.core = core;
        this.root = core.ui.news;

        this.logs = this.root.querySelector("#update-logs");
    }

    render(data) {
        this.#logs = data;

        // Render each log entry with timestamp and message
        let lastMsg;
        for (const {timestamp, message} of this.#logs) {
            const timeEl = document.createElement('div');
            timeEl.className = 'timestamp';
            timeEl.textContent = timestamp;

            const msgEl = document.createElement('div');
            msgEl.className = 'message';
            msgEl.textContent = message;

            this.logs.appendChild(timeEl);
            this.logs.appendChild(msgEl);

            lastMsg = timeEl;
        }
        if (lastMsg) {
            this.logs.scrollTop = this.logs.scrollHeight;
            lastMsg.ontransitionend = () => {
                verticalScroll(this.logs, 2);
            }
        }
    }

    updateVisibility(loc, panel) {
        this.core.industry.updateLoops();
        if (loc === "right") {
            if (panel === "news") {
                this.root.classList.add("shown");
            } else {
                this.root.classList.remove("shown");
            }
        }
    }
}
