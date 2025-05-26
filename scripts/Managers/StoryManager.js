// /src/managers/StoryManager.js
import {delay} from "../Utils.js";
import Tutorial from "../Episodes/Tutorial.js";
import TypingService from "../UI/Services/TypingService.js";

export default class StoryManager {
    #episodes = {};
    #running = false;
    #subscriber;

    constructor(core) {
        this.core = core;
        // set up the Tutorial episode
        this.#episodes.Tutorial = Tutorial(this);

        this.progress = {Tutorial: 0};
        this.snapshots = {Tutorial: ""};
        this.choices = {Tutorial: {}};
        this.currentEpisode = null;

        core.clock.subscribeRealTime(() => this.run(), {interval: 1});
    }

    set subscriber(sub) {
        this.#subscriber = sub;
    }

    get episodes() {
        return this.#episodes;
    }

    // internal: start a specific episode at a phase
    async runAt(episode, phase) {
        this.currentEpisode = episode;
        this.#subscriber.reset(this.snapshots[episode]);
        await delay(300);
        // let the episode script take over
        await this.#episodes[episode].runFrom(phase);
    }

    recordFact(key, value) {
        this.choices[this.currentEpisode][key] = value;
    }

    recordChoice(i) {
        this.choices[this.currentEpisode][this.progress[this.currentEpisode]] = i;
    }

    getChoice(i, episode= this.currentEpisode) {
        return this.choices[episode][i];
    }

    getLastChoice() {
        return this.choices[this.currentEpisode][this.progress[this.currentEpisode] - 1];
    }


    // checkpoint and persist
    checkpoint(phase) {
        this.progress[this.currentEpisode] = phase;
        this.snapshots[this.currentEpisode] = this.core.ui.story.innerHTML || "";
        this.core.managers.saves.record(this.currentEpisode, phase, {overwrite: true});
    }

    async typeP(text, opts = {}) {
        return await TypingService.typeP(text, this.core.ui.story, opts);

    }

    async typeWithInputs(text, ...args) {
        return await TypingService.typePWithInputs(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async typeWithSpans(text, ...args) {
        return await TypingService.typePWithSpans(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async typeWithChoices(text, ...args) {
        return await TypingService.typePWithChoices(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async choiceNote(text, ...args) {
        // noinspection JSCheckFunctionSignatures
        return await TypingService.choiceNote(text, this.core.ui.story, ...args);
    }

    run() {
        if (this.core.ui.activePanels["center"] !== "story") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;

        const phase = this.progress.Tutorial ?? 0;
        this.runAt("Tutorial", phase);
    }

    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        this.run();
    }
}
