export default class SaveManager {

    constructor(core) {
        this.core = core;
        this.list = JSON.parse(localStorage.getItem('saveList')) || [];
    }

    record() {
        const data = {};
        for (const [key, comp] of this.core.saveableComponents) {
            data[key] = comp.serialize();
        }

        const timestamp = Date.now();
        const save = {
            version: this.core.currentVersion, timestamp, data
        };

        const id = `save:${timestamp}`;

        localStorage.setItem(id, JSON.stringify(save));

        const entry = {id, timestamp};
        this.list.push(entry);

        this.list.sort((a, b) => b.timestamp - a.timestamp);
        localStorage.setItem('saveList', JSON.stringify(this.list));
    }


    async jump(i) {
        const key = this.list[i].id;
        await this.load(localStorage.getItem(key));
    }

    delete(index) {
        const entry = this.list[index];
        if (!entry) return;

        localStorage.removeItem(entry.id);

        this.list.splice(index, 1);

        localStorage.setItem('saveList', JSON.stringify(this.list));
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
}
