export default class FarmPanel {

    constructor(core) {
        this.core = core;
        this.root = core.ui.farm;

        this.core.farm.onUpdate(() => {
            this.render();
        });
    }

    render() {

    }

    updateVisibility(loc, panel) {
        if (loc === "center") {
            if (panel === "farm")
                this.root.classList.add("shown");
            else
                this.root.classList.remove("shown");
        }
    }
}
