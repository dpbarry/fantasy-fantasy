export default class IndustryPanel {

    constructor(core) {
        this.core = core;
        this.root = core.ui.industry;

        this.resourcebox = this.root.querySelector("#industry-resource");
    }

    render(data) {
    }

    updateVisibility(loc, panel) {
        if (loc === "center") {
            if (panel === "industry") {
                this.root.classList.add("shown");
            }
            else {
                this.root.classList.remove("shown");
            }
        }
    }
}
