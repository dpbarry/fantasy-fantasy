export default class SettingsPanel {
    #settings;

    constructor(core) {
        this.core = core;
        this.root = core.ui.settings;

        this.core.city.onUpdate((data) => {
            this.#settings = data;
            this.render();
        });
    }

    render() {
       this.root.querySelectorAll(".setting").forEach(() => {

       });
    }
}
