export default class SettingsPanel {
    #settings;

    constructor(core) {
        this.core = core;
        this.root = core.ui.settings;

        this.root.innerHTML = `
            <div class="subbox">
                <strong>Appearance</strong>
                <div class="setting-row">
                    <div class="setting theme">
                        <label for="dark">Background</label>
                        <div class="inputs">
                            <input checked id="dark" name="background" type="radio" />
                            <input id="light" name="background" type="radio" />
                        </div>
                    </div>
                    <div class="setting theme">
                        <label for="lightning">Theme</label>
                        <div class="inputs">
                            <input checked id="lightning" name="accent" type="radio" />
                            <input id="acid" name="accent" type="radio" />
                            <input id="amber" name="accent" type="radio" />
                            <input id="arcane" name="accent" type="radio" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="subbox">
                <strong>Game</strong>
                <div class="setting-row">
                    <div class="setting">
                        <label for="numformat">Number Format</label>
                        <div class="inputs">
                            <select id="numformat" name="numformat">
                                <option selected value="standard">Standard</option>
                                <option value="scientific">Scientific</option>
                                <option value="alphabetical">Alphabetical</option>
                            </select>
                        </div>
                    </div>
                    <div class="setting">
                        <label for="offlineprogress">Offline Progress</label>
                        <div class="inputs">
                            <select id="offlineprogress" name="offlineprogress">
                                <option selected value="on">On</option>
                                <option value="off">Off</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="subbox">
                <strong>System</strong>
                <div class="setting-row">
                    <div class="setting">
                        <label for="refreshUI">UI Refresh Rate</label>
                        <div class="inputs">
                            <select id="refreshUI" name="refreshUI">
                                <option value="100">100</option>
                                <option value="75">75</option>
                                <option value="50">50</option>
                                <option selected value="30">30</option>
                                <option value="20">20</option>
                                <option value="10">10</option>
                                <option value="5">5</option>
                                <option value="1">1</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            <div class="subbox">
                <strong>About</strong>
                <div id="about">
                    This site does not collect any data and is a WIP. Most icons are sourced from <a
                        href="https://game-icons.net/about.html#:~:text=Authors%20%26%20Contributors">game-icons.net</a>.
                    <a href="https://github.com/dpbarry/fantasy-fantasy" id="github" rel="noopener noreferrer"
                        target="_blank"></a>
                </div>
            </div>
        `;

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
