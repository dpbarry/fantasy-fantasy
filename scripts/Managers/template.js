// Manager template — copy this when adding a new game-state manager.
//
// A Manager owns a slice of game state, advances it on tick (if applicable),
// and exposes serialize/deserialize so GameStorage can persist it.
//
// Contract (anything optional is checked dynamically by GameCore):
//   - constructor(core)     — required.
//   - tick(dt)              — optional. Called from GameCore.gameLoop with
//                             frame delta in seconds (decoupled from FPS).
//                             Only managers driving real-time progression
//                             need this (e.g., IndustryManager, ClockManager).
//   - boot()                — optional. Called once after save load completes,
//                             so you can re-apply UI state, restart loops, or
//                             unlock UI affordances based on persisted flags.
//   - serialize()           — required to persist. Return a plain object
//                             (no class instances, no DOM refs, no functions).
//   - deserialize(data)     — required to persist. Restore state from the
//                             object returned by serialize(). Be defensive:
//                             old saves may not have new fields.
//
// Registration:
//   Add to GameCore.managers map:
//     this.managers = { ..., myManager: new MyManager(this) };
//   Anything with serialize+deserialize is auto-registered for save/load.

export default class TemplateManager {
    constructor(core) {
        this.core = core;

        // Initialize state with sensible defaults so a brand-new game just
        // works. deserialize() will override these from a save when present.
        this.score = 0;
        this.flags = { unlocked: false };
        this.config = { auto: true };
    }

    // Optional: called from GameCore.gameLoop with frame delta in seconds.
    // Keep this lean — it runs every frame.
    tick(dt) {
        // Advance state. Use Big number library (`break_infinity.esm.js`) for
        // anything that may grow large. Avoid DOM access here; let panels
        // observe state via render().
    }

    // Optional: called once after save loads. Use for actions that depend on
    // the DOM being ready and saved state being restored.
    boot() {
        if (this.flags.unlocked) {
            // Example: unlock a UI element. Set data-skip-bloom first if this
            // is a state-restore (not a user-witnessed transition):
            //
            // const btn = document.querySelector("#myNav");
            // btn.dataset.skipBloom = "";
            // btn.classList.remove("locked");
        }
    }

    // Required for persistence. Strip the back-ref to core (it's a cycle) and
    // anything else that shouldn't survive the JSON round-trip.
    serialize() {
        return {
            score: this.score,
            flags: this.flags,
            config: this.config,
        };
    }

    // Required for persistence. Be defensive about missing fields — old
    // saves may not have what newer code expects.
    deserialize(data) {
        if (!data) return;
        if (typeof data.score === "number") this.score = data.score;
        if (data.flags) this.flags = { ...this.flags, ...data.flags };
        if (data.config) this.config = { ...this.config, ...data.config };
    }
}
