export default class UserManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('hero', this);

        this.firstName = "";
        this.lastName = "";
        this.gender = "";
        this.savvy = 0;
        this.valor = 0;
        this.wisdom = 0;
    }

    unlockStatus(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.core.ui.unlockPanel(this.core.ui.userstatus).then(() => {
            this.renderStatus();
        });
    }

    renderStatus() {
        // Create and setup the panel content
        const nameElement = document.createElement('div');
        nameElement.id = 'character-name';
        nameElement.className = 'hastip';
        nameElement.dataset.tip = 'mc-name';
        this.core.ui.registerTip('mc-name', () => {
            const stats = [
                { name: "Savvy", value: this.savvy, class: "savvyWord" },
                { name: "Valor", value: this.valor, class: "valorWord" },
                { name: "Wisdom", value: this.wisdom, class: "wisdomWord" }
            ];

            return this.core.ui.createStatsGrid(stats);
        });

        nameElement.textContent = `${this.firstName} ${this.lastName}`;

        const dateElement = document.createElement('div');
        dateElement.id = 'game-date';
        dateElement.className = 'hastip';
        dateElement.dataset.tip = 'verbosedate';
        this.core.ui.registerTip('verbosedate', () => {
            return this.core.clock.gameDate({format: "verbose"});
        });

        const updateDate = () => {
            dateElement.textContent = this.core.clock.gameDate({format: "numeric"});
            switch (this.core.clock.getSeason()) {
                case "Winter":
                    dateElement.style.color = "hsl(200, 35%, 80%)";
                    break;
                case "Spring":
                    dateElement.style.color = "hsl(120, 35%, 80%)";
                    break;
                case "Summer":
                    dateElement.style.color = "hsl(0 35%, 80%)";
                    break;
                case "Autumn":
                    dateElement.style.color = "hsl(50, 35%, 80%)";
                    break;
            }
        };

            updateDate();
            // Subscribe to time updates with a 1-second interval
            this.core.clock.subscribeGameTime(() => {
                updateDate();
            }, {interval: 1});

            this.core.ui.userstatus.appendChild(nameElement);
            this.core.ui.userstatus.appendChild(dateElement);
        }


    genderSwitch(male, female) {
        return this.gender === "M" ? male : female;
    }

    serialize() {
        return {
            firstName: this.firstName, lastName: this.lastName, gender: this.gender
        }
    }

    deserialize(data) {
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.gender = data.gender;

        if (this.firstName) {
            this.core.ui.userstatus.querySelector(".lockedpanel").remove();
            this.renderStatus();
        }
    }

}