export default class QuickAccess {
    #status = {};

    constructor(core) {
        this.core = core;
        this.root = this.core.ui.quickacc;
    }

    render(data) {
        this.#status = data;
        if (!this.root.classList.contains("shown")) {
            return;
        }
        this.#status.quickAccess.forEach(() => {
            // add links
        });
    }
}
