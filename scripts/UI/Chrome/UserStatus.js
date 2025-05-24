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

        // Subscribe to game time ticks to update date/season if unlocked
        if (this.core.clock) {
            this.core.clock.subscribeGameTime(() => {
                if (this.#status.statusAccess.date) {
                    this.#status.gameDate = this.core.clock.gameDate({format: "numeric"});
                    this.#status.season = this.core.clock.getSeason();
                    this.renderDate();
                }
            }, {interval: 1});
        }


        // Initial render with current status
        this.#status = this.core.mc.getStatus();
        this.render();
    }

    render() {
        this.root.innerHTML = "";

        if (this.#status.statusAccess.name) {
            const nameElement = document.createElement("div");
            nameElement.id = "character-name";
            nameElement.className = "hastip";
            nameElement.dataset.tip = "mc-name";
            nameElement.textContent = `${this.#status.firstName} ${this.#status.lastName}`;
            this.root.appendChild(nameElement);
        }

        if (this.#status.statusAccess.date) {
            // Create or update the date element
            let dateElement = this.root.querySelector("#game-date");
            if (!dateElement) {
                dateElement = document.createElement("div");
                dateElement.id = "game-date";
                dateElement.className = "hastip";
                dateElement.dataset.tip = "verbosedate";
                this.root.appendChild(dateElement);
            }
            this.renderDate();
        }
    }

    renderDate() {
        const dateElement = this.root.querySelector("#game-date");
        if (!dateElement || !this.#status.gameDate || !this.#status.season) return;

        dateElement.textContent = this.#status.gameDate;

        // Season-based coloring
        switch (this.#status.season) {
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
