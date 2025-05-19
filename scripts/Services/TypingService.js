import GeneralService from "./GeneralService.js";
import InputService from "./InputService.js";

export default class TypingService {
    static TYPE_DELAY = 5;

    static async typeOn(text, body) {
        // first add all the characters invisibly to establish justified alignment
        await this.hideText(text, body);

        // now gradually "type" each character
        await this.renderText(body);

        return Promise.resolve(body);
    }

    // convenience function to abstract the <p> created in a message
    static async typeP(text, body) {
        let p = document.createElement("p");
        body.appendChild(p);
        await this.typeOn(text, p);
        return Promise.resolve(p);
    }

    static async renderText(p) {
        for (const span of [...p.children]) {
            if (span.classList.contains("deep")) {
                await this.renderText(span);
                span.classList.add("visible");
            } else {
                await GeneralService.delay(this.TYPE_DELAY);
                Object.assign(span.style, {
                    color: "", pointerEvents: "", userSelect: ""
                });
            }
        }
    }

    static hideText(text, body) {
        [...text].forEach(c => {
            let span = document.createElement("span");
            span.innerText = c;
            span.style.color = "transparent";
            span.style.pointerEvents = "none";
            span.style.userSelect = "none";
            body.appendChild(span);
        });
    }

    static async typePWithSpans(text, body, spanIDs, spanTexts) {
        let p = document.createElement("p");
        body.appendChild(p);
        let spans = [];

        let count = 0;
        [...text].forEach(c => {
            let span = document.createElement("span");
            if (c === "@") {
                span.classList.add("deep");
                span.id = spanIDs[count];
                this.hideText(spanTexts[count++], span);
                spans.push(span);
            } else {
                span.style.color = "transparent";
                span.style.pointerEvents = "none";
                span.style.userSelect = "none";
                span.innerText = c;
            }
            p.appendChild(span);

        });

        await this.renderText(p);


        p.querySelectorAll(".deep").forEach((elem) => this.collapseP(elem));
        return Promise.resolve([p, spans]);
    }


    // expects a string with @
    static async typePWithInputs(text, body, width, ids, cb) {
        let p = document.createElement("p");
        body.appendChild(p);
        [...text].forEach(c => {
            let span = document.createElement("span");
            if (c === "@") {
                span.className = "inputwrap";
                span.style.width = width;
            } else {
                span.style.color = "transparent";
                span.style.pointerEvents = "none";
                span.style.userSelect = "none";
                span.innerText = c;
            }
            p.appendChild(span);
        });


        let inputIndex = 0;
        let inputs = [];

        for (const span of [...p.children]) {
            await GeneralService.delay(this.TYPE_DELAY);

            if (span.className === "inputwrap") {
                const input = InputService.getInput(ids[inputIndex++], cb);
                input.style.width = "0";
                inputs.push(input);
                span.appendChild(input);

                setTimeout(() => input.style.width = "", 10);

                await GeneralService.waitForEvent(input, "transitionend", 250);
            } else {
                Object.assign(span.style, {
                    color: "", pointerEvents: "", userSelect: ""
                });
            }
        }

        return Promise.resolve([p, inputs]);
    }

    static async typePWithChoices(text, body, choices) {
        return this.typeP(text, body).then((p) => {
            const choiceContainer = document.createElement('div');
            choiceContainer.className = 'choice-container';
            p.after(choiceContainer);

            const choiceElements = choices.map((choice, index) => {
                const choiceElement = document.createElement('div');
                choiceElement.className = 'choice';
                choiceElement.innerText = choice;
                choiceElement.style.animationDelay = `${index * 0.2}s`;
                choiceElement.style.pointerEvents = "none";
                choiceElement.onanimationend = () => {
                    choiceElement.onanimationend = null;
                    choiceElement.style.pointerEvents = "";
                }
                choiceContainer.appendChild(choiceElement);
                return choiceElement;
            });
            return new Promise(resolve => {
                choiceElements.forEach((choiceElement, index) => {
                    choiceElement.onclick = () => {
                        body._mutationObserver.disconnect();
                        choiceElements.forEach(el => el.onclick = null);
                        choiceElement.classList.add('selected');

                        const unselectedElements = choiceElements.filter(el => el !== choiceElement);
                        unselectedElements.forEach(el => {
                            el.classList.add('unselected');
                            el.style.fontSize = '0';
                        });

                        setTimeout(() => {
                            body._mutationObserver.observe(body, {
                                childList: true,
                                subtree: true,
                                characterData: true
                            });

                            resolve({
                                i: index, el: choiceElement
                            });
                        }, 250);
                    };
                });
            });
        });
    }

    static async choiceNote(el, msg, spanIDs = [], spanTexts = []) {
        const note = document.createElement("p");
        note.className = "choice-note";
        el.after(note);
        return this.typePWithSpans(msg, note, spanIDs, spanTexts).then(() => {
            this.collapseP(note.firstChild);
            return note.firstChild;
        });
    }


    static collapseP(p, opt = (x) => x.outerHTML) {
        p.innerHTML = [...p.children].reduce((acc, x) => {
            if (!x.className.trim()) return acc + x.innerHTML; else return acc + opt(x);
        }, "");
        return p;
    }

}