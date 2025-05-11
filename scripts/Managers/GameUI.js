import NewsService from "../Services/NewsService.js";

export default class GameUI {
    constructor(core) {
        this.core = core;
        this.story = document.getElementById("story");
        this.news = document.getElementById("updates");
        this.selfpanel = document.getElementById("selfpanel");
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById("logo").onclick = () => location.href = location.href;
        document.querySelectorAll("#navbar button").forEach(b =>
            b.onpointerdown = () => {
                b.classList.add("chosen");
                document.querySelectorAll(".chosen").forEach(b => b.classList.remove("chosen"));
            }
        );

        // Setup nudge effects
        document.querySelectorAll(".nudge").forEach(b =>
            b.addEventListener("pointerdown", () =>
                b.classList.add("nudged")
            ));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        // Setup keyboard
        document.querySelectorAll(".key").forEach(k => {
            k.tabIndex = 0;
            k.addEventListener("pointerdown", () =>
                k.classList.add("nudged")
            );
            k.onpointerdown = () => {
                k.focus();

                setTimeout(() => {
                    let input = document.activeElement;
                    switch (k.innerText) {
                        case "⏎":
                            input.dispatchEvent(
                                new KeyboardEvent('keydown', {
                                    code: 'Enter',
                                    key: 'Enter',
                                    charCode: 13,
                                    keyCode: 13,
                                    view: window,
                                    bubbles: true
                                })
                            );
                            break;
                        case "SPC":
                            input.dispatchEvent(
                                new KeyboardEvent('keydown', {
                                    code: 'Space',
                                    key: ' ',
                                    charCode: 32,
                                    keyCode: 32,
                                    view: window,
                                    bubbles: true
                                })
                            );
                            break;
                        case "⟵":
                            input.value = input.value.slice(0, -1);
                            input.dispatchEvent(
                                new Event('input', {bubbles: true, cancelable: true})
                            );
                            break;
                        default:
                            input.value = input.value + k.innerText;
                            input.dispatchEvent(
                                new Event('input', {bubbles: true, cancelable: true})
                            );
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

    pushUpdate(message) {
        NewsService.updateOn(this.news, message, this.core.clock.gameTime({format: "short"}));
    }

}