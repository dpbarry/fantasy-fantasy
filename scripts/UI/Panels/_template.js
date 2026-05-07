// New panel: register in UIManager.readyPanels; root id matches nav data-panel (main slot shown).
// Required: constructor(core), updateVisibility(loc, panel). Optional: render(data).

export default class TemplatePanel {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("my-panel");
    }

    render(data) {
    }

    updateVisibility(loc, panel) {
        if (loc !== "main") return; // ledger panels: loc === "ledger"
        const mine = panel === "my-panel";
        this.root.classList.toggle("shown", mine);
    }
}
