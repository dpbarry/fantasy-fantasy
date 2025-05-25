export default class CityInfo {
    #status;

    constructor(core) {
        this.core = core;
        this.root = core.ui.rightbar.querySelector("#cityinfo");
        this.header = this.root.querySelector("#city-header");

        this.core.city.onUpdate((data, command="render") => {
            if (command === "render") {
                this.#status = data;
                this.render();
            } else if (command === "time") {
                this.renderTime(data);
            }

        });
    }

    render() {
        if (this.root.querySelector(".lock")) return;

        let cityName = this.root.querySelector("#city-name");
        if (!cityName) {
            cityName = document.createElement("h1");
            cityName.id = "city-name";
            cityName.innerText = this.#status.name;
        }
        this.header.appendChild(cityName);
    }
    renderTime(t) {
        console.log(t);
        let time = this.header.querySelector("#time");
        if (!time) {
            time = document.createElement("span");
            time.id = "time";
            this.header.appendChild(time);
        }

        time.innerText = t;
    }
}
