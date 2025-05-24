export default class StoryScreen {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("story");
        this.manager = core.story;

        // subscribe to story events
        this.manager.onContent(this._onStoryContent.bind(this));

        // auto-scroll on new content
        this._setupAutoScroll();
    }

    show() {
        this.root.classList.remove("hidden");
        this.manager._maybeStart();  // ensure we start if not yet running
    }

    hide() {
        this.root.classList.add("hidden");
    }

    _onStoryContent({ type, html }) {
        if (type === "reset") {
            this.root.innerHTML = html;
        } else if (type === "append") {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            this.root.append(wrapper);
        }
    }

    _setupAutoScroll() {
        const scrollNow = () => {
            const last = this.root.lastElementChild;
            if (!last) return;
            const rectC = this.root.getBoundingClientRect();
            const rectL = last .getBoundingClientRect();
            if (rectL.bottom > rectC.bottom) {
                this.root.scrollTo({ top: this.root.scrollHeight, behavior: "smooth" });
            }
        };

        // watch for new nodes
        let scrollObserver = new MutationObserver(scrollNow);
        this.root._scrollObserver = scrollObserver;
        scrollObserver.observe(this.root, {
            childList: true,
            subtree:   true
        });
        window.addEventListener("resize", scrollNow);
    }
}
