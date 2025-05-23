export default class SnapshotService {
    static record(core, episodeName, phase) {
        const componentsData = {};
        for (const [key, comp] of core.saveableComponents) {
            componentsData[key] = comp.serialize();
        }

        const payload = {
            version:   core.currentVersion,
            timestamp: Date.now(),
            episode:   episodeName,
            phase:     phase,
            data:      componentsData
        };

        localStorage.setItem(
            `snapshot:${episodeName}:${phase}`,
            JSON.stringify(payload)
        );
    }

    static async jumpToEp(core, episodeName, phase) {
        const key = `snapshot:${episodeName}:${phase}`;
        const save = localStorage.getItem(key);
        if (!save) {
            throw new Error(`No snapshot found at ${key}`);
        }

        core.pause();
        window.onbeforeunload = null;
        await new Promise(resolve => {
            if (core.pendingSave) {
                const checkSave = setInterval(() => {
                    if (!core.pendingSave) {
                        clearInterval(checkSave);
                        resolve();
                    }
                }, 10);
            } else {
                resolve();
            }
        });

        localStorage.clear();

        await core.storage.save(JSON.parse(save));

        location.reload();
    }
}
