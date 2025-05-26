import {verticalScroll} from "../../Utils.js";

export default class NewsPanel {
    #logs = [];

    constructor(core) {
        this.core = core;
        this.root = core.ui.news.querySelector("#upate-logs");

        this.core.managers.news.onUpdate((data) => {
            this.#logs = data;
            this.render();
        });
    }

    render() {
        // Render each log entry with timestamp and message
        let lastMsg;
        for (const {timestamp, message} of this.#logs) {
            const timeEl = document.createElement('div');
            timeEl.className = 'timestamp';
            timeEl.textContent = timestamp;

            const msgEl = document.createElement('div');
            msgEl.className = 'message';
            msgEl.textContent = message;

            this.root.appendChild(timeEl);
            this.root.appendChild(msgEl);

            lastMsg = timeEl;
        }
        if (lastMsg) {
            this.root.scrollTop = this.root.scrollHeight;
            lastMsg.ontransitionend = () => {
                verticalScroll(this.root, 2);
            }
        }
    }
}
