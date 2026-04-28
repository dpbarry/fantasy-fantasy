// A Panel is a thin wrapper around a DOM container that:
//   1. Caches its root element + any sub-elements it needs.
//   2. Optionally builds its initial DOM in the constructor (or expects HTML
//      to already be in index.html — both styles are used; pick what fits).
//   3. Exposes `render(data)` so its Manager can ask it to re-paint with
//      fresh state (typically called from a UI render interval or after a
//      game-loop tick).
//   4. Exposes `updateVisibility(loc, panel)` so UIManager.show() can
//      orchestrate which panel is visible. The panel checks if `loc` is its
//      slot ('main' or 'ledger') and if `panel` matches its panel name; toggles
//      the .shown class accordingly.
//
// Contract:
//   - constructor(core)       — required.
//   - render(data)            — optional. Called from manager when state changes.
//   - updateVisibility(loc, panel) — required. Called from UIManager.show()
//                              for every panel registered in UIManager.panels.
//
// Registration:
//   Add an entry in UIManager.readyPanels():
//     this.panels = {
//       ...,
//       myPanel: new MyPanel(this.core),
//     };
//
// Add an HTML container (in index.html) with a stable id:
//   <div class="panel" id="my-panel"></div>     (inside #main-panel)
// or
//   <div class="box panel" id="my-ledger"></div> (inside #ledger)
//
// Add a navbutton (or ledger-tab) that targets it:
//   <button class="navbutton hastip" data-loc="main" data-panel="my-panel"
//           data-tips="myPanelnav">...</button>

export default class TemplatePanel {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("my-panel");

        // Cache any sub-elements you'll need:
        // this.scoreEl = this.root.querySelector(".score");

        // Build initial DOM here if the HTML wasn't pre-rendered:
        // this.root.innerHTML = `<h2>Title</h2>...`;

        // Register tooltips, listeners, etc. Use the patterns from existing panels:
        // this.core.ui.hookTip(buttonEl, 'myPanel-action');
        // buttonEl.addEventListener('pointerdown', () => this.handleAction());

        // If you need a periodic render, register an interval that the
        // manager will throttle to the user's refreshUI setting:
        // this.core.ui.createRenderInterval(() => this.render(this.core.myPanel.getData()));
    }

    render(data) {
        // Update DOM from `data`. Be defensive against undefined fields.
        // Avoid full innerHTML rewrites — diff and update specific nodes for
        // smooth animation continuity.
    }

    updateVisibility(loc, panel) {
        // `loc` is 'main' or 'ledger' (defined by UIManager.activePanels keys).
        // `panel` is whichever panel just became active in that slot.
        // Toggle .shown on the root only when our slot is the one being changed.
        if (loc !== "main") return;             // change to "ledger" for ledger panels
        const mine = panel === "my-panel";
        this.root.classList.toggle("shown", mine);

        // If your panel hosts heavy game-loop work (animations, intervals),
        // pause it when not visible to save cycles:
        // if (mine) this.core.myManager.resume();
        // else      this.core.myManager.pause();
    }
}
