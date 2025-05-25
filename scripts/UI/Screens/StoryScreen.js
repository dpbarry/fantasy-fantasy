export default class StoryScreen {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("story");
        this.manager = core.story;
        this.manager.subscriber = this;

        // auto-scroll on new content
        this.setupAutoScroll();
    }

    show() {
        this.root.classList.remove("hidden");
        this.manager.runStory();  // ensure we start if not yet running
    }

    hide() {
        this.root.classList.add("hidden");
    }

    reset(html) {
        this.root.innerHTML = html;
        this.root.scrollBy({top: this.root.scrollHeight});
    }

    setupAutoScroll() {
        const scrollNow = () => {
            const last = this.root.lastElementChild;
            if (!last) return;
            const rectC = this.root.getBoundingClientRect();
            const rectL = last.getBoundingClientRect();
            if (rectL.bottom > rectC.bottom) {
                this.root.scrollTo({top: this.root.scrollHeight, behavior: "smooth"});
            }
        };

        // watch for new nodes
        let scrollObserver = new MutationObserver(scrollNow);
        this.root._scrollObserver = scrollObserver;
        scrollObserver.observe(this.root, {
            childList: true, subtree: true
        });
        window.addEventListener("resize", () => {
            this.root.scrollTo({top: this.root.scrollHeight, behavior: "instant"});
        });
    }
}
