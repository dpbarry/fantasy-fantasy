export default class FarmPanel {

    constructor(core) {
        this.core = core;
        this.root = core.ui.farm;
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
