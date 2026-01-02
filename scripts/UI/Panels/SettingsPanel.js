import createSelect from "../Components/Select.js";

export default class SettingsPanel {
    #settings;
    #selects = {};

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
                        <label>Number Format</label>
                        <div class="inputs" id="numformat-container"></div>
                    </div>
                    <div class="setting">
                        <label>Offline Progress</label>
                        <div class="inputs" id="offlineprogress-container"></div>
                    </div>
                </div>
            </div>
            <div class="subbox">
                <strong>System</strong>
                <div class="setting-row">
                    <div class="setting">
                        <label>UI Refresh Rate</label>
                        <div class="inputs" id="refreshUI-container"></div>
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

        this.#selects.numformat = createSelect({
            options: [
                { value: 'standard', label: 'Standard' },
                { value: 'scientific', label: 'Scientific' },
                { value: 'alphabetical', label: 'Alphabetical' }
            ],
            value: 'standard',
            onChange: (value) => this.core.settings.updateSetting('numformat', value)
        });
        this.root.querySelector('#numformat-container').appendChild(this.#selects.numformat.element);

        this.#selects.offlineprogress = createSelect({
            options: [
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' }
            ],
            value: 'on',
            onChange: (value) => this.core.settings.updateSetting('offlineprogress', value)
        });
        this.root.querySelector('#offlineprogress-container').appendChild(this.#selects.offlineprogress.element);

        this.#selects.refreshUI = createSelect({
            options: [
                { value: '100', label: '100' },
                { value: '75', label: '75' },
                { value: '50', label: '50' },
                { value: '30', label: '30' },
                { value: '20', label: '20' },
                { value: '10', label: '10' },
                { value: '5', label: '5' },
                { value: '1', label: '1' }
            ],
            value: '30',
            onChange: (value) => this.core.settings.updateSetting('refreshUI', value)
        });
        this.root.querySelector('#refreshUI-container').appendChild(this.#selects.refreshUI.element);

        this.root.querySelectorAll("input").forEach((i) => {
            i.onchange = () => {
                if (i.type === "checkbox" || i.type === "radio") {
                    this.core.settings.updateSetting(i.name, i.id);
                }
            };
        });
    }

    render(data) {
        this.#settings = data;
        Object.entries(this.#settings).forEach(([k, v]) => {
            if (this.#selects[k]) {
                this.#selects[k].setValue(v);
                return;
            }

            let i = this.root.querySelector(`input[name="${k}"][id="${v}"]`);
            if (i && (i.type === "checkbox" || i.type === "radio")) {
                i.checked = true;
                [...i.parentNode.children].forEach(x => {
                    if (x !== i) {
                        x.removeAttribute("checked");
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
