export default class SaveManager {

    constructor(core) {
        this.core = core;
        this.list = JSON.parse(localStorage.getItem('saveList')) || [];
    }

    record(episodeName = null, phase = null, opts = {overwrite: true}) {
        const data = {};
        for (const [key, comp] of this.core.saveableComponents) {
            data[key] = comp.serialize();
        }

        const timestamp = Date.now();
        const save = {
            version: this.core.currentVersion, timestamp, data
        };

        const id = opts.overwrite ? `save:${episodeName}:${phase}` : `save:${episodeName}:${phase}:${timestamp}`;

        localStorage.setItem(id, JSON.stringify(save));

        const type = episodeName ? "story" : "normal";
        const entry = {id, type, timestamp};
        if (type === "story") {
            entry.episode = episodeName;
            entry.phase = phase;
        }

        if (opts.overwrite && type === "story") {
            const idx = this.list.findIndex(e => e.episode === episodeName && e.phase === phase);
            if (idx >= 0) {
                this.list[idx] = entry;
            } else {
                this.list.push(entry);
            }
        } else {
            this.list.push(entry);
        }

        this.list.sort((a, b) => b.timestamp - a.timestamp);
        localStorage.setItem('saveList', JSON.stringify(this.list));
    }


    async jump(i) {
        console.log(this.list)
        const key = this.list[i].id;
        await this.load(localStorage.getItem(key));
    }

    async jumpToEp(episodeName, phase) {
        const key = `save:${episodeName}:${phase}`;
        const save = localStorage.getItem(key);
        await this.load(save);
    }

    async load(save) {
        if (!save) {
            throw new Error(`No save found`);
        }

        this.core.pause();
        window.onbeforeunload = null;
        await new Promise(resolve => {
            if (this.core.pendingSave) {
                const checkSave = setInterval(() => {
                    if (!this.core.pendingSave) {
                        clearInterval(checkSave);
                        resolve();
                    }
                }, 10);
            } else {
                resolve();
            }
        });

        await this.core.storage.save(JSON.parse(save));

        location.reload();
    }


    delete(index) {
        const entry = this.list[index];
        if (!entry) return;

        localStorage.removeItem(entry.id);

        this.list.splice(index, 1);

        localStorage.setItem('saveList', JSON.stringify(this.list));
    }


}
