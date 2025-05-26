import InputService from "./InputService.js";
import * as Utils from "../../Utils.js";
import {delay, waitForEvent} from "../../Utils.js";

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

    static async typeWithSpans(text, body, spanTexts, spanClasses = [], spanTips = []) {
        const spans = [];
        let count = 0;

        [...text].forEach(c => {
            const span = document.createElement("span");

            if (c === "@") {
                if (spanClasses.length > count) span.className = spanClasses[count];
                span.classList.add("deep", "hidespan");
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
                    color: "transparent", transition: "color 0.15s", pointerEvents: "none", userSelect: "none"
                });
            }

            body.appendChild(span);
        });

        await this.renderText(body);

        body.querySelectorAll(".deep").forEach(elem => this.collapseP(elem));
        return Promise.resolve([body, spans]);
    }

    static async typePWithSpans(text, body, spanTexts, spanClasses = [], spanTips = []) {
        const p = document.createElement("p");
        body.appendChild(p);
        return this.typeWithSpans(text, p, spanTexts, spanClasses, spanTips);
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
                    color: "transparent", transition: "color 0.15s", pointerEvents: "none", userSelect: "none"
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
                    color: "", pointerEvents: "", userSelect: ""
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
        // Insert text paragraph and collapse as before
        const p = await this.typeP(text, body);
        this.collapseP(p);

        // Create container for choices
        const choiceContainer = document.createElement("div");
        choiceContainer.className = "choice-container";
        p.after(choiceContainer);

        // Create choice elements
        const choiceElements = choices.map((choice, index) => {
            const el = document.createElement("div");
            el.className = "choice adding";
            el.innerText = choice;
            el.style.animationDelay = `${index * 0.2}s`;
            el.style.pointerEvents = "none";

            el.onanimationend = () => {
                el.classList.remove("adding");
                el.classList.add("added");
                el.style.pointerEvents = "";
                el.onanimationend = null;
            };

            choiceContainer.appendChild(el);
            return el;
        });

        return new Promise(resolve => {
            choiceElements.forEach((el, i) => {
                el.onclick = async () => {
                    if (body._scrollObserver) body._scrollObserver.disconnect();
                    choiceElements.forEach(c => c.onclick = null);
                    el.classList.add("selected");

                    const unselected = choiceElements.filter(c => c !== el);
                    const addedHeight = unselected.reduce((sum, c) => sum + c.getBoundingClientRect().height, 0);

                    unselected.forEach(c => {
                        c.classList.add("unselected");
                        c.style.fontSize = "0";
                    });

                    if (i === 0) {
                        await Utils.delay(250);
                        const currentPad = parseFloat(getComputedStyle(document.querySelector('#story')).paddingBottom) || 0;
                        document.querySelector('#story').style.paddingBottom = `${currentPad + addedHeight}px`;
                        unselected.forEach(c => c.remove());
                    } else {
                        const clones = unselected.map(orig => {
                            const clone = orig.cloneNode(true);
                            clone.style.opacity = "1";
                            choiceContainer.appendChild(clone);
                            clone.style.fontSize = "";
                            return clone;
                        });

                        await Utils.delay(550);

                        unselected.forEach(c => c.remove());
                        const currentPad = parseFloat(getComputedStyle(document.querySelector('#story')).paddingBottom) || 0;
                        document.querySelector('#story').style.paddingBottom = `${currentPad + addedHeight}px`;
                        document.querySelector("#story")._excessPadding += addedHeight;
                        clones.forEach(c => c.remove());
                    }

                    if (body._scrollObserver) {
                        body._scrollObserver.observe(body, {
                            childList: true, subtree: true, characterData: true
                        });
                    }
                    resolve({i, el});
                };
            });
        });
    }


    static async choiceNote(text, body, spanTexts = [], spanClasses = [], spanTips = []) {
        if (!text) return;
        const note = document.createElement("p");
        note.className = "choice-note";
        body.appendChild(note);
        return this.typeWithSpans(text, note, spanTexts, spanClasses, spanTips).then(() => {
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
                    color: "", pointerEvents: "", userSelect: ""
                });
            }
        }
    }

    static hideText(text, body) {
        [...text].forEach(c => {
            const span = document.createElement("span");
            span.innerText = c;
            Object.assign(span.style, {
                color: "transparent", transition: "color 0.15s", pointerEvents: "none", userSelect: "none"
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
