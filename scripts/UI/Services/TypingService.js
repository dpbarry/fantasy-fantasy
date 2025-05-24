import InputService from "./InputService.js";
import { delay, waitForEvent } from "../../Utils.js";

export default class TypingService {
    static TYPE_DELAY = 5;

    static async type(text, body) {
        await this.hideText(text, body);
        await this.renderText(body);
        this.collapseP(body);
        return Promise.resolve(body);
    }

    static async typeP(text, body) {
        const p = document.createElement("p");
        body.appendChild(p);
        await this.type(text, p);
        return Promise.resolve(p);
    }

    static async typeWithSpans(text, body, spanIDs, spanTexts, spanClasses = [], spanTips = []) {
        const spans = [];
        let count = 0;

        [...text].forEach(c => {
            const span = document.createElement("span");

            if (c === "@") {
                if (spanClasses.length > count) span.className = spanClasses[count];
                span.classList.add("deep", "hidespan");
                span.id = spanIDs[count];
                span.style.pointerEvents = "none";
                span.style.cursor = "default";

                if (spanTips.length > count) {
                    span.dataset.tip = spanTips[count];
                    span.classList.add("hastip");
                }

                this.hideText(spanTexts[count++], span);
                spans.push(span);
            } else {
                span.innerText = c;
                Object.assign(span.style, {
                    color: "transparent",
                    transition: "color 0.15s",
                    pointerEvents: "none",
                    userSelect: "none"
                });
            }

            body.appendChild(span);
        });

        await this.renderText(body);

        body.querySelectorAll(".deep").forEach(elem => this.collapseP(elem));
        return Promise.resolve([body, spans]);
    }

    static async typePWithSpans(text, body, spanIDs, spanTexts, spanClasses = [], spanTips = []) {
        const p = document.createElement("p");
        body.appendChild(p);
        return this.typeWithSpans(text, p, spanIDs, spanTexts, spanClasses, spanTips);
    }

    static async typeWithInputs(text, body, width, className = "", cb, type = "alpha") {
        const inputs = [];

        [...text].forEach(c => {
            const span = document.createElement("span");

            if (c === "@") {
                span.className = "inputwrap";
                span.style.width = width;
                span._width = width;
            } else {
                span.innerText = c;
                Object.assign(span.style, {
                    color: "transparent",
                    transition: "color 0.15s",
                    pointerEvents: "none",
                    userSelect: "none"
                });
            }

            body.appendChild(span);
        });

        for (const span of [...body.children]) {
            await delay(this.TYPE_DELAY);

            if (span.className === "inputwrap") {
                const input = InputService.getInput(cb, type, className);
                input.style.width = "0";
                inputs.push(input);
                span.appendChild(input);

                setTimeout(() => input.style.width = "", 25);
                await waitForEvent(input, "transitionend", 300);
            } else {
                Object.assign(span.style, {
                    color: "",
                    pointerEvents: "",
                    userSelect: ""
                });
            }
        }
        return Promise.resolve([body, inputs]);
    }

    static async typePWithInputs(text, body, width, className = "", cb, type = "alpha") {
        const p = document.createElement("p");
        body.appendChild(p);
        return this.typeWithInputs(text, p, width, className, cb, type);
    }

    static async typePWithChoices(text, body, choices) {
        return this.typeP(text, body).then(p => {
            this.collapseP(p);

            const choiceContainer = document.createElement("div");
            choiceContainer.className = "choice-container";
            p.after(choiceContainer);

            const choiceElements = choices.map((choice, index) => {
                const choiceElement = document.createElement("div");
                choiceElement.className = "choice";
                choiceElement.innerText = choice;
                choiceElement.style.animationDelay = `${index * 0.2}s`;
                choiceElement.style.pointerEvents = "none";
                choiceElement.classList.add("adding");

                choiceElement.onanimationend = () => {
                    choiceElement.classList.remove("adding");
                    choiceElement.classList.add("added");
                    choiceElement.onanimationend = null;
                    choiceElement.style.pointerEvents = "";
                };

                choiceContainer.appendChild(choiceElement);
                return choiceElement;
            });

            return new Promise(resolve => {
                choiceElements.forEach((choiceElement, index) => {
                    choiceElement.onclick = () => {
                        if (body._scrollObserver) body._scrollObserver.disconnect();

                        choiceElements.forEach(el => el.onclick = null);
                        choiceElement.classList.add("selected");

                        choiceElements.filter(el => el !== choiceElement).forEach(el => {
                            el.classList.add("unselected");
                            el.style.fontSize = "0";
                        });

                        setTimeout(() => {
                            if (body._scrollObserver) {
                                body._scrollObserver.observe(body, {
                                    childList: true,
                                    subtree: true,
                                    characterData: true
                                });
                            }
                            resolve({ i: index, el: choiceElement });
                        }, 550);
                    };
                });
            });
        });
    }

    static async choiceNote(el, msg, spanIDs = [], spanTexts = [], spanClasses = [], spanTips = []) {
        const note = document.createElement("p");
        note.className = "choice-note";
        el.after(note);
        return this.typeWithSpans(msg, note, spanIDs, spanTexts, spanClasses, spanTips).then(() => {
            this.collapseP(note);
            return note;
        });
    }

    static async renderText(p) {
        for (const span of [...p.children]) {
            if (span.classList.contains("deep")) {
                span.classList.remove("hidespan");
                span.style.pointerEvents = "";
                span.style.cursor = "";
                await this.renderText(span);
                span.classList.add("visible");
            } else {
                await delay(this.TYPE_DELAY);
                Object.assign(span.style, {
                    color: "",
                    pointerEvents: "",
                    userSelect: ""
                });
            }
        }
    }

    static hideText(text, body) {
        [...text].forEach(c => {
            const span = document.createElement("span");
            span.innerText = c;
            Object.assign(span.style, {
                color: "transparent",
                transition: "color 0.15s",
                pointerEvents: "none",
                userSelect: "none"
            });
            body.appendChild(span);
        });
    }

    static collapseP(p, opt = (x) => x.outerHTML) {
        p.innerHTML = [...p.childNodes].reduce((acc, node) => {
            if (node.nodeType === Node.TEXT_NODE) return acc + node.textContent;
            if (!node.className || !node.className.trim()) return acc + node.innerHTML;
            return acc + opt(node);
        }, "");
        return p;
    }
}
