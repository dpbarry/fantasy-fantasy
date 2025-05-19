export default class GameUI {
    constructor(core) {
        this.core = core;
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.userstatus = document.getElementById("user-status");
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById("logo").onclick = () => location.href = location.href;
        document.querySelectorAll("#navbar button").forEach(b => b.onpointerdown = () => {
            b.classList.add("chosen");
            document.querySelectorAll(".chosen").forEach(b => b.classList.remove("chosen"));
        });

        // Setup nudge effects
        document.querySelectorAll(".nudge").forEach(b => b.addEventListener("pointerdown", () => b.classList.add("nudged")));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        // Setup keyboard
        document.querySelectorAll(".key").forEach(k => {
            k.tabIndex = 0;
            k.addEventListener("pointerdown", () => k.classList.add("nudged"));
            k.onpointerdown = () => {
                k.focus();

                setTimeout(() => {
                    let input = document.activeElement;
                    switch (k.innerText) {
                        case "⏎":
                            input.dispatchEvent(new KeyboardEvent('keydown', {
                                code: 'Enter', key: 'Enter', charCode: 13, keyCode: 13, view: window, bubbles: true
                            }));
                            break;
                        case "SPC":
                            input.dispatchEvent(new KeyboardEvent('keydown', {
                                code: 'Space', key: ' ', charCode: 32, keyCode: 32, view: window, bubbles: true
                            }));
                            break;
                        case "⟵":
                            input.value = input.value.slice(0, -1);
                            input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                            break;
                        default:
                            input.value = input.value + k.innerText;
                            input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                    }


                }, 0);
            };
        });
    }

    /**
     * @param {HTMLElement} el
     */
    unlockPanel(el) {
        el.querySelector(".lockedpanel").classList.add("hide");
        return new Promise(resolve => {
            el.querySelector(".lockedpanel").ontransitionend = () => {
                el.querySelector(".lockedpanel").remove();
                resolve();
            }
        })
    }

    createTutorialHighlight(content) {
        const box = document.createElement('div');
        const text = document.createElement('div');
        box.className = 'tutorial-highlight';
        text.className = 'tutorial-highlight-text';
        text.innerHTML = content;
        box.appendChild(text);
        this.story.appendChild(box);

        return {
            destroy: () => {
                box.style.opacity = '0';
                box.addEventListener('transitionend', () => {
                    box.remove();
                });
            }
        };
    }


    createTooltip(element, content) {
        return new this.Tooltip(element, content);
    }

    createInteractiveTooltip(element, func, interval = 1000) {
        let tooltip = new this.Tooltip(element, "Loading...");


        async function updateContent() {
            tooltip.tooltipElement.innerHTML = await func();
        }



        const originalShow = tooltip.show.bind(tooltip);

        tooltip.showHandler = async function () {
            await updateContent();
            originalShow();

            this.updateInterval = setInterval(() => {
                updateContent();
            }, interval);
        };

        const originalDestroy = tooltip.destroy.bind(tooltip);
        tooltip.destroyHandler = function () {
            if (this.updateInterval) {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            originalDestroy();
        };
        tooltip.element.removeEventListener('mouseenter', tooltip.showHandler);
        tooltip.element.removeEventListener('mouseleave', tooltip.destroyHandler);
        tooltip.element.addEventListener('mouseenter', tooltip.showHandler.bind(tooltip));
        tooltip.element.addEventListener('mouseleave', tooltip.destroyHandler.bind(tooltip));


        return tooltip;
    }

    Tooltip = class {
        constructor(element, content) {
            this.element = element;
            this.tooltipElement = document.createElement('div');
            this.tooltipElement.className = 'tooltip';
            this.tooltipElement.innerHTML = content;
            this.showHandler = this.show.bind(this);
            this.destroyHandler = this.destroy.bind(this);
            this.element.addEventListener('mouseenter', this.showHandler);
            this.element.addEventListener('mouseleave', this.destroyHandler);
        }

        show() {
            this.tooltipElement.style.opacity = "";
            this.tooltipElement.ontransitionend = null;
            document.body.appendChild(this.tooltipElement);
            const rect = this.element.getBoundingClientRect();
            this.tooltipElement.style.top = `${rect.top - this.tooltipElement.offsetHeight}px`;
            this.tooltipElement.style.left = `${rect.left + (rect.width - this.tooltipElement.offsetWidth) / 2}px`;
        }

        destroy() {
            this.tooltipElement.style.opacity = "0";
            this.tooltipElement.ontransitionend = () => {
                this.tooltipElement.remove();
            };
        }
    }
}