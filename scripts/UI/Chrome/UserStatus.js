export default class UserStatus {
    #status = {};

    constructor(core) {
        this.core = core;
        this.root = this.core.ui.userstatus;

        // Subscribe to UserManager updates
        this.core.mc.onUpdate((status) => {
            this.#status = status;
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
        if (this.#status.statusAccess.date) {
            this.root.querySelector("#game-date").classList.remove("nodisplay");
            this.renderDate();
        }
        if (this.#status.statusAccess.bonds) {
            this.root.querySelector("#bondnav").classList.remove("nodisplay");
        }

    }
    renderDate() {
        const dateElement = this.root.querySelector("#game-date");
        if (!dateElement) return;

        dateElement.textContent = this.core.clock.gameDate({format: "numeric"});

        switch (this.core.clock.getSeason()) {
            case "Winter":
                dateElement.style.color = "hsl(200, 35%, 80%)";
                break;
            case "Spring":
                dateElement.style.color = "hsl(120, 35%, 80%)";
                break;
            case "Summer":
                dateElement.style.color = "hsl(0, 35%, 80%)";
                break;
            case "Autumn":
                dateElement.style.color = "hsl(50, 35%, 80%)";
                break;
            default:
                dateElement.style.color = "";
                break;
        }
    }
}
