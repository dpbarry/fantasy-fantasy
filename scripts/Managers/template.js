// New manager: add to GameCore.managers. serialize + deserialize → save/load; optional tick(dt), boot().

export default class TemplateManager {
    constructor(core) {
        this.core = core;
        this.score = 0;
        this.flags = { unlocked: false };
        this.config = { auto: true };
    }

    tick(dt) {
    }

    boot() {
        if (this.flags.unlocked) {
        }
    }

    serialize() {
        return {
            score: this.score,
            flags: this.flags,
            config: this.config,
        };
    }

    deserialize(data) {
        if (!data) return;
        if (typeof data.score === "number") this.score = data.score;
        if (data.flags) this.flags = { ...this.flags, ...data.flags };
        if (data.config) this.config = { ...this.config, ...data.config };
    }
}
