export default class UserManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('hero', this);

        this.firstName = "";
        this.lastName = "";
    }

    unlock(firstName, lastName) {
        this.firstName = firstName;
        this.lastName = lastName;

        this.core.ui.unlockPanel(this.core.ui.selfpanel).then(() => {
            // Create and setup the panel content
            const nameElement = document.createElement('div');
            nameElement.className = 'character-name';
            nameElement.textContent = `${firstName} ${lastName}`;

            const timeElement = document.createElement('div');
            timeElement.className = 'game-time';
            
            // Update time immediately
            timeElement.textContent = this.core.clock.gameTime({format: 'full'});
            
            // Subscribe to time updates with a 1-second interval
            this.core.clock.subscribeGameTime(() => {
                timeElement.textContent = this.core.clock.getDate({format: "full"}) + " " + this.core.clock.gameTime({format: 'full'});
            }, { interval: 1 });

            this.core.ui.selfpanel.appendChild(nameElement);
            this.core.ui.selfpanel.appendChild(timeElement);
        });
    }

    serialize() {

    }

    deserialize(data) {

    }

}