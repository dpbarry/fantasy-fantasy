export default class StoryPanel {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("story");
        this.manager = core.story;
        this.manager.subscriber = this;

        // auto-scroll on new content
        this.setupAutoScroll();
        this.root._excessPadding = 0;
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
            if (rectL.bottom > rectC.bottom - 45) {
                this.root.scrollTo({top: this.root.scrollHeight - this.root._excessPadding, behavior: "smooth"});
                this.root.style.paddingBottom = "";
                this.root._excessPadding = 0;
            }
        };

        // watch for new nodes
        let scrollObserver = new MutationObserver(scrollNow);
        this.root._scrollObserver = scrollObserver;
        scrollObserver.observe(this.root, {
            childList: true, subtree: true
        });
        window.addEventListener("resize", () => {
           scrollNow();
        });
    }

    updateVisibility(loc, panel) {
        console.log(loc, panel)
        if (loc === "center") {
            if (panel === "story")
                this.root.closest(".box").classList.add("shown");
            else
                this.root.closest(".box").classList.remove("shown");
        }
    }
}
