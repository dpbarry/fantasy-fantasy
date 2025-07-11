export default class SettingsPanel {
    #settings;

    constructor(core) {
        this.core = core;
        this.root = core.ui.settings;

        this.root.querySelectorAll("input, select").forEach((i) => {
            i.onchange = () => {
                if (i.type === "checkbox" || i.type === "radio") {
                    this.core.settings.updateSetting(i.name, i.id);
                } else if (i.nodeName === "SELECT") {
                    this.core.settings.updateSetting(i.id, i.value);
                }
            };
        })
    }

    render(data) {
        this.#settings = data;
        Object.entries(this.#settings).forEach(([k,v]) => {
            let i = this.root.querySelector(`input[name="${k}"][id="${v}"]`) ?? this.root.querySelector(`select[name="${k}"] option[value="${v}"]`);
            if (i.type === "checkbox" || i.type === "radio") {
                i.checked = true;
                [...i.parentNode.children].forEach(x => {
                    if (x !== i) {
                        x.removeAttribute("checked");
                    }
                });
            } else if (i.nodeName === "OPTION") {
                i.selected = true;
                [...i.parentNode.children].forEach(x => {
                    if (x !== i) {
                        x.removeAttribute("selected");
                    }
                });
            }
        });
    }

    updateVisibility(loc, panel) {
        if (loc === "right") {
            if (panel === "settings")
                this.root.classList.add("shown");
            else
                this.root.classList.remove("shown");
        }
    }
}
