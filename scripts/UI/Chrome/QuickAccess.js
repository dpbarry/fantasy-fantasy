export default class QuickAccess {
    #status = {};

    constructor(core) {
        this.core = core;
        this.root = this.core.ui.quickacc;

        // Subscribe to UserManager updates
        this.core.mc.onUpdate((data) => {
                this.#status = data;
                this.render();
        });
    }

    render() {
        if (!this.root.classList.contains("shown")) {
            return;
        }
        this.#status.quickAccess.forEach(() => {
            // add links
        });
    }
}
