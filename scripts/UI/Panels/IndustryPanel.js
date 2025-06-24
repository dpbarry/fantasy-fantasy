export default class IndustryPanel {

    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;
    }

    render() {

    }

    updateVisibility(loc, panel) {
        if (loc === "center") {
            if (panel === "industry") {
                this.root.classList.add("shown");
                this.core.ui.center.querySelector("#industrypanelnav").classList.add("shown");
            }
            else {
                this.root.classList.remove("shown");
                this.core.ui.center.querySelector("#industrypanelnav").classList.remove("shown");
            }
        }
    }
}
