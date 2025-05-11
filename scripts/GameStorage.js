export default class GameStorage {
    constructor() {
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
}