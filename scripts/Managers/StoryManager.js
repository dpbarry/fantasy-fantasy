import TypingService from "../Services/TypingService.js";
import GeneralService from "../Services/GeneralService.js";
import Tutorial from "../Episodes/Tutorial.js";

export default class StoryManager {
    #episodes;
    #storyRunning;

    constructor(core) {
        this.core = core;
        this.#episodes = {}; // namespace container
        this.#storyRunning = false;

        this.core.registerSaveableComponent('story', this);
        this.core.onTick(() => this.runStory());

        this.storyProg = {
            Tutorial: 0
        };
        this.storyText = {
            Tutorial: ""
        }
        this.currentEpisode = null;

        this.initEpisodes();
        this.setupAutoScroll();
    }

    set storyRunning(bool) {
        this.#storyRunning = bool;
    }

    get episodes() {
        return this.#episodes;
    }

    initEpisodes() {
        this.#episodes.Tutorial = Tutorial(this);
    }

    epCheckpoint(n) {
        this.storyProg[this.currentEpisode] = n;
        this.storyText[this.currentEpisode] = this.textSnapshot();
        this.core.saves.record(this.currentEpisode, n, {overwrite: true});
    }

    setupAutoScroll() {
        let scrollTimeout;
        const autoScroll = () => {
            clearTimeout(scrollTimeout);

            scrollTimeout = setTimeout(() => {
                const storyEl = this.core.ui.story;
                const lastChild = storyEl.lastElementChild;
                if (!lastChild) return;

                const containerRect = storyEl.getBoundingClientRect();
                const lastChildRect = lastChild.getBoundingClientRect();

                if (lastChildRect.bottom > containerRect.bottom) {
                    storyEl.scrollTo({
                        top: storyEl.scrollHeight, behavior: 'smooth'
                    });
                }
            }, 100);
        }
        this.observer = new MutationObserver(() => {
            autoScroll();
        });

        window.addEventListener("resize", () => {
            autoScroll();
        })

        this.observer.observe(this.core.ui.story, {
            childList: true, subtree: true, characterData: true
        });
        this.core.ui.story._mutationObserver = this.observer;
    }

    async typePWithInputs(text, width, className, cb, type) {
        return TypingService.typePWithInputs(text, this.core.ui.story, width, className, cb, type);
    }

    async typePWithSpans(text, spanIDs, spanTexts, spanClasses = [], spanTips = []) {
        return TypingService.typePWithSpans(text, this.core.ui.story, spanIDs, spanTexts, spanClasses, spanTips);
    }

    typeP(text) {
        TypingService.typeP(text, this.core.ui.story);
    }

    typePWithChoices(text, choices) {
        return TypingService.typePWithChoices(text, this.core.ui.story, choices);
    }


    textSnapshot() {
        return this.core.ui.story.innerHTML;
    }

    async runEpisodeAt(episode, phase) {
        this.currentEpisode = episode;
        this.core.ui.story.innerHTML = this.storyText[episode];
        await GeneralService.delay(300);
        await this.#episodes[episode].runFrom(phase);
    }


    runStory() {
        if (this.core.activePanel === this.core.ui.story) {
            if (!this.#storyRunning) {
                this.#storyRunning = true;

                if (this.currentEpisode) {
                    this.runEpisodeAt(this.currentEpisode, this.storyProg[this.currentEpisode]);
                } else {
                    if (this.storyProg.Tutorial !== -1)
                        this.runEpisodeAt("Tutorial", this.storyProg.Tutorial);
                    else {
                        // screen to review past stories or start new one
                    }
                }
            }
        } else {
            this.#storyRunning = false;
        }
    }


    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
    }
}


