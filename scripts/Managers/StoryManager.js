// /src/managers/StoryManager.js
import {delay} from "../Utils.js";
import Tutorial from "../Episodes/Tutorial.js";
import TypingService from "../UI/Services/TypingService.js";

export default class StoryManager {
    #episodes = {};
    #running = false;
    #subscriber = () => {};

    constructor(core) {
        this.core = core;
        // set up the Tutorial episode
        this.#episodes.Tutorial = Tutorial(this);
        
        this.progress = {Tutorial: 0};
        this.snapshots = {Tutorial: ""};
        this.currentEpisode = null;

        // on every tick, maybe start the story
        core.onTick(() => this._maybeStart());
    }

    get episodes() {
        return this.#episodes;
    }

    // UI subscription: screen will call this to receive resets/appends
    onContent(fn) {
        this.#subscriber = fn;
    }

    // internal: start a specific episode at a phase
    async _run(episode, phase) {
        this.currentEpisode = episode;
        // tell UI to reset (with the last snapshot)
        this.#subscriber({type: "reset", html: this.snapshots[episode]});
        await delay(300);
        // let the episode script take over
        await this.#episodes[episode].runFrom(phase);
    }

    // called by episode whenever it has an HTML snippet to show
    emit(html) {
        this.#subscriber({type: "append", html});
    }

    // checkpoint and persist
    checkpoint(phase) {
        this.progress[this.currentEpisode] = phase;
        this.snapshots[this.currentEpisode] = this.core.ui.story.innerHTML || "";
        this.core.managers.saves.record(this.currentEpisode, phase, {overwrite: true});
    }

    // Public API for episodes to type text
    async type(text, opts = {}) {
        // opts can include inputs, spans, choices, etc.
        // you can extend this to dispatch to different TypingService methods
       return await TypingService.typeP(text, this.core.ui.screens.story.root, opts);

    }

    async typeWithInputs(text, ...args) {
        return await TypingService.typePWithInputs(
            text,
            this.core.ui.screens.story.root,
            ...args
        );
    }

    async typeWithSpans(text, ...args) {
        return await TypingService.typePWithSpans(
            text,
            this.core.ui.screens.story.root,
            ...args
        );
    }

    async typeWithChoices(text, ...args) {
        return await TypingService.typePWithChoices(
            text,
            this.core.ui.screens.story.root,
            ...args
        );
    }

    // story loop starter
    _maybeStart() {
        const ui = this.core.managers.ui;
        if (ui.activeScreen !== "story") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;

        const phase = this.progress.Tutorial ?? 0;
        this._run("Tutorial", phase);
    }

    serialize() {
        const { core, ...rest } = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }
    updateAccess() {
    }
}
