export default class CityInfoPanel {
    #status;

    constructor(core) {
        this.core = core;
        this.root = core.ui.cityinfo;
        this.header = this.root.querySelector("#city-header");
    }

    render(data) {
        this.#status = data;
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

    updateVisibility(loc, panel) {
        if (loc === "right") {
            if (panel === "cityinfo")
                this.root.classList.add("shown");
            else
                this.root.classList.remove("shown");
        }
    }
}
