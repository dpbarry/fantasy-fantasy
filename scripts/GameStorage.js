export default class GameStorage {
    constructor(core) {
        this.core = core;
        this.storageKey = "gameState";
    }

    async save(data) {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(this.storageKey, serializedData);
            return true;
        } catch (error) {
            console.error('Failed to save game state:', error);
            throw error;
        }
    }

    async load() {
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

    get devSave() {
        try {
            const baseSave = {
                version: this.core.currentVersion,
                timestamp: Date.now(),
                data: {}
            };

            for (const [key, component] of this.core.saveableComponents) {
                baseSave.data[key] = component.serialize();
            }

            baseSave.data.story.progress = { Prologue: 6 };
            baseSave.data.story.choices = { Prologue: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
            baseSave.data.story.currentEpisode = null;

            baseSave.data.city.ruler = {
                firstName: "Al",
                lastName: "Green",
                gender: "M",
                savvy: 0,
                valor: 0,
                wisdom: 10
            };

            baseSave.data.city.name = "Beliard";

            baseSave.data.industry.access = { basic: true };

            baseSave.data.news.logs = [{timestamp: "07:22", message: "You woke up from a strange dream."}];

            baseSave.data.ui.activePanels = { 
                left: "", 
                center: "industry", 
                right: "settings" 
            };
            baseSave.data.ui.visibleSection = "center";

            return baseSave;
        } catch (error) {
            console.error('Failed to generate dev save from current state:', error);
            return {
                version: "0.1.2",
                timestamp: Date.now(),
                data: {
                    story: { progress: { Prologue: 6 }, choices: { Prologue: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }, currentEpisode: null },
                    city: { name: "Test City", ruler: { firstName: "Test", lastName: "Player", gender: "M", savvy: 10, valor: 0, wisdom: 0 } },
                    industry: { access: { basic: true } },
                    news: { logs: [{timestamp: "07:22", message: "You woke up from a strange dream."}] },
                    ui: { activePanels: { left: "", center: "industry", right: "settings" }, visibleSection: "center" }
                }
            };
        }
    }
}