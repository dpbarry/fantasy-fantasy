import {verticalScroll} from "../../Utils.js";

export default class NewsPanel {
    #logs = [];

    constructor(core) {
        this.core = core;
        this.mainRoot = document.getElementById("news");
        this.ledgerRoot = document.getElementById("log");
        this.mainLogs = this.mainRoot?.querySelector("#update-news");
        this.ledgerLogs = this.ledgerRoot?.querySelector("#update-logs");
    }

    #renderInto(container) {
        if (!container) return;
        container.innerHTML = "";

        let lastMsg;
        for (const {timestamp, message} of this.#logs) {
            const timeEl = document.createElement('div');
            timeEl.className = 'timestamp';
            timeEl.textContent = timestamp;

            const msgEl = document.createElement('div');
            msgEl.className = 'message';
            msgEl.textContent = message;

            container.appendChild(timeEl);
            container.appendChild(msgEl);

            lastMsg = timeEl;
        }
        if (lastMsg) {
            container.scrollTop = container.scrollHeight;
            lastMsg.ontransitionend = () => {
                verticalScroll(container, 2);
            };
        }
    }

    render(data) {
        this.#logs = data;
        if (this.core.ui.isPanelVisible("main", "news")) {
            this.#renderInto(this.mainLogs);
        }
        if (this.core.ui.isPanelVisible("ledger", "log")) {
            this.#renderInto(this.ledgerLogs);
        }
    }

    updateVisibility(loc, panel) {
        if (loc === "main") {
            const isMainNews = panel === "news";
            this.mainRoot?.classList.toggle("shown", isMainNews);
            if (isMainNews) {
                this.#renderInto(this.mainLogs);
            }
            return;
        }
        if (loc === "ledger") {
            const isLedgerLog = panel === "log" && this.core.ui.isLedgerVisible();
            this.ledgerRoot?.classList.toggle("shown", isLedgerLog);
            if (isLedgerLog) {
                this.#renderInto(this.ledgerLogs);
            }
        }
    }

    onVisibilityChange({ activePanels }) {
        this.updateVisibility("main", activePanels.main);
        this.updateVisibility("ledger", activePanels.ledger);
    }
}
