export default class GameStorage {
    constructor(core) {
        this.core = core;
        this.storageKey = "gameState";
        this.saveListKey = "saveList";
        this.list = JSON.parse(localStorage.getItem(this.saveListKey)) || [];
    }

    async storeSave(data) {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(this.storageKey, serializedData);
            return true;
        } catch (error) {
            console.error('Failed to save game state:', error);
            throw error;
        }
    }

    async fetchSave() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Failed to load game state:', error);
            throw error;
        }
    }

    clearExcept(saveData) {
        try {
            localStorage.clear();
            
            if (saveData) {
                localStorage.setItem(this.storageKey, JSON.stringify(saveData));
            }
            
            return true;
        } catch (error) {
            console.error('Failed to clear storage:', error);
            throw error;
        }
    }

    recordSave() {
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
        localStorage.setItem(this.saveListKey, JSON.stringify(this.list));
    }

    async loadSave(i) {
        const key = this.list[i].id;
        const save = localStorage.getItem(key);
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
        await this.storeSave(JSON.parse(save));
        location.reload();
    }

    deleteSave(index) {
        const entry = this.list[index];
        if (!entry) return;
        localStorage.removeItem(entry.id);
        this.list.splice(index, 1);
        localStorage.setItem(this.saveListKey, JSON.stringify(this.list));
    }

    async saveFullGame(core) {
        try {
            const componentsData = {};
            for (const [key, component] of core.saveableComponents) {
                componentsData[key] = component.serialize();
            }
            const snapshot = {
                version: core.currentVersion, timestamp: Date.now(), data: componentsData
            };
            await this.storeSave(snapshot);
            return true;
        } catch (error) {
            console.error('Save failed:', error);
            return false;
        }
    }

    async loadFullGame(core) {
        try {
            const snapshot = await this.fetchSave();
            if (!snapshot) return false;
            if (snapshot.version !== core.currentVersion) {
                console.warn(`Save version ${snapshot.version} not supported (want ${core.currentVersion}). Resetting...`);
                return false;
            }
            for (const [key, component] of core.saveableComponents) {
                if (snapshot.data[key]) {
                    if (typeof component.deserialize === 'function') {
                        component.deserialize(snapshot.data[key], snapshot.timestamp);
                    }
                } else {
                    console.warn(`No saved data found for component: ${key}`);
                }
            }
            
            if (snapshot.isDev) {
                core.city.name = "Beliard";
                core.city.ruler.firstName = "Al";
                core.city.ruler.lastName = "Green";
                core.city.ruler.gender = "M";
                core.city.ruler.wisdom = 10;
            }
            
            return true;
        } catch (error) {
            console.error('Load failed:', error);
            return false;
        }
    }

    get devSave() {
        try {
            // Minimal save - just skip prologue and unlock industry
            const baseSave = {
                version: this.core.currentVersion,
                timestamp: Date.now(),
                isDev: true, // Flag to trigger dev overrides
                data: {
                    story: {
                        progress: { Prologue: 6 },
                        choices: { 2: 2 },
                        currentEpisode: null
                    },
                    industry: {
                        access: { basic: true }
                    },
                    ui: {
                        activePanels: {
                            left: "",
                            center: "industry",
                            right: "settings"
                        },
                        visibleSection: "center"
                    }
                }
            };

            return baseSave;
        } catch (error) {
            console.error('Failed to generate dev save from current state:', error);
            return false;
        }
    }
}