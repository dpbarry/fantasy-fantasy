import TypingService from "../Services/TypingService.js";
import GeneralService from "../Services/GeneralService.js";
import Tutorial from "../Episodes/Tutorial.js";

export default class StoryManager {
    #episodes;

    constructor(core) {
        this.core = core;
        this.storyProg = {
            Tutorial: 0
        };
        this.storyText = {
            Tutorial: ""
        }
        this.#episodes = {}; // namespace container
        this.initEpisodes();
        core.registerSaveableComponent('story', this);
        this.setupAutoScroll();
    }

    get episodes() {
        return this.#episodes;
    }

    initEpisodes() {
        this.#episodes.Tutorial = Tutorial(this);
    }

    setupAutoScroll() {
        let scrollTimeout;
        const autoScroll = () => {
            clearTimeout(scrollTimeout);

            scrollTimeout = setTimeout(() => {
                const storyEl = this.core.ui.story;
                const lastChild = storyEl.lastElementChild;
                if (!lastChild) return;

                // Check if last element's bottom edge is below the viewport
                const containerRect = storyEl.getBoundingClientRect();
                const lastChildRect = lastChild.getBoundingClientRect();

                // If the bottom of the last child is below the container's visible area
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
        this.core.ui.story.innerHTML = this.storyText[episode];
        await GeneralService.delay(300);
        await this.#episodes[episode].runFrom(phase);
    }


    serialize() {
        const {core, ...rest} = this;
        return rest;
    }

    deserialize(data) {
        Object.assign(this, data);
    }

    updateAccess() {
        if (this.storyProg.Tutorial !== -1)
            this.runEpisodeAt("Tutorial", this.storyProg.Tutorial);
    }
}


