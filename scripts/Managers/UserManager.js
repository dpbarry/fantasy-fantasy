export default class UserManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('user', this);

        this.firstName = "";
        this.lastName = "";
        this.gender = "";
        this.savvy = 0;
        this.valor = 0;
        this.wisdom = 0;
        this.morality = 0;

        this.statusAccess = {
            name: false, date: false
        };
    }

    unlockStatus(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.statusAccess.name = true;
        this.statusAccess.date = true;
        this.core.ui.unlockPanel(this.core.ui.userstatus).then(() => {
            this.renderStatus();
        });
    }

    renderStatus() {
        // Create and setup the panel content
        if (this.statusAccess.name) {
            const nameElement = document.createElement('div');
            nameElement.id = 'character-name';
            nameElement.className = 'hastip';
            nameElement.dataset.tip = 'mc-name';
            this.core.ui.tooltips.registerTip('mc-name', () => {
                const stats = [{name: "Savvy", value: this.savvy, class: "savvyWord"}, {
                    name: "Valor", value: this.valor, class: "valorWord"
                }, {name: "Wisdom", value: this.wisdom, class: "wisdomWord"}, {
                    name: "Morality", value: this.morality, class: "moralWord"
                },];

                return this.core.ui.createStatsGrid(stats);
            });

            nameElement.textContent = `${this.firstName} ${this.lastName}`;
            this.core.ui.userstatus.appendChild(nameElement);
        }

        if (this.statusAccess.date) {
            const dateElement = document.createElement('div');
            dateElement.id = 'game-date';
            dateElement.className = 'hastip';
            dateElement.dataset.tip = 'verbosedate';
            this.core.ui.tooltips.registerTip('verbosedate', () => {
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

            this.core.ui.userstatus.appendChild(dateElement);

        }
    }


    genderSwitch(male, female) {
        return this.gender === "M" ? male : female;
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (Object.values(this.statusAccess).some(value => value)) {
            this.core.ui.userstatus.querySelector(".lockedpanel").remove();
        }
        this.renderStatus();
    }
}