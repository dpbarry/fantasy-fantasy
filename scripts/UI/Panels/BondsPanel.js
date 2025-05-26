export default class BondsPanel {
    #status;

    constructor(core) {
        this.core = core;
        this.root = core.ui.bonds;
        this.nav = document.getElementById("bondsnav");

        this.core.mc.onUpdate((data) => {
            this.#status = data;
            this.render();
        });

        this.nav.onclick = () => {
            this.root.ontransitionend = null;
            this.root.classList.remove("hide");
            this.core.mc.bondRunning = !this.core.mc.bondRunning;
            if (this.core.mc.bondRunning) {
                this.root.classList.add("visible");
                this.root.ontransitionend = () => {
                    this.root.ontransitionend = null;
                    window.dispatchEvent(new Event("resize"));
                };
                
            } else {
                this.nav.classList.remove("chosen");
                this.root.classList.add("hide");
                this.root.ontransitionend = () => {
                    this.root.classList.remove("visible");
                    this.root.classList.remove("hide");
                };
            }
        }
    }

    render() {
        if (this.root.querySelector(".lock")) return;
        this.root.innerHTML = "";
        Object.entries(this.#status.bonds).forEach(([key, value]) => {
            let name = document.createElement("span");
            name.className = "bondPerson";
            name.textContent = key;
            let bond = document.createElement("span");
            bond.textContent = value;
            bond.className = "bondValue";

            this.root.appendChild(name);
            this.root.appendChild(bond);
        })
    }

    toggleShow() {

    }
}