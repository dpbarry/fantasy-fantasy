export default class UserStatus {
    #status = {};

    constructor(core) {
        this.core = core;
        this.root = this.core.ui.userstatus;

        // Subscribe to UserManager updates
        this.core.mc.onUpdate((data) => {
                this.#status = data;
                this.render();
        });
    }

    render() {
        if (this.core.ui.userstatus.querySelector(".lock")) {
            return;
        }
        if (this.#status.statusAccess.name) {
            const nameElement = this.root.querySelector("#character-name");
            nameElement.classList.remove("nodisplay");
            nameElement.textContent = `${this.#status.firstName} ${this.#status.lastName}`;
        }
        
        if (this.#status.statusAccess.bonds) {
            this.root.querySelector("#bondsnav").classList.remove("nodisplay");
        }

    }
}
