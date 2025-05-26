export default class CityInfoPanel {
    #status;

    constructor(core) {
        this.core = core;
        this.root = core.ui.cityinfo;
        this.header = this.root.querySelector("#city-header");

        this.core.city.onUpdate((data) => {
            this.#status = data;
            this.render();
        });
    }

    render() {
        if (this.root.querySelector(".lock")) return;
        if (this.#status.cityInfoAccess.header) {
            let cityName = this.root.querySelector("#city-name");
            if (!cityName) {
                cityName = document.createElement("h1");
                cityName.id = "city-name";
                cityName.innerText = this.#status.name;
            }
            this.header.appendChild(cityName);
            let cityLevel = this.root.querySelector("#city-level");
            if (!cityLevel) {
                cityLevel = document.createElement("span");
                cityLevel.id = "city-level";
                cityLevel.innerText = this.#status.level;
            }
            // this.header.appendChild(cityLevel);
        }
    }
}
