import GeneralService from "./GeneralService.js";
import InputService from "./InputService.js";

export default class TypingService {
    static TYPE_DELAY = 10;

    static async typeOn(text, body) {
        // first add all the characters invisibly to establish justified alignment
        await this.hideText(text, body);

        // now gradually "type" each character
        await this.renderText(body);

        return Promise.resolve(body);
    }

    // convenience function to abstract the <p> created in a message
    static async  typeP(text, body) {
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
                    color: "",
                    pointerEvents: "",
                    userSelect: ""
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

    static async  typePWithSpans(text, body, spanIDs, spanTexts) {
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


        p.querySelectorAll(".deep").forEach(this.collapseP);
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

                inputs.push(input);
                span.appendChild(input);


                await GeneralService.waitForEvent(input, "transitionend");
            } else {
                Object.assign(span.style, {
                    color: "",
                    pointerEvents: "",
                    userSelect: ""
                });
            }
        }

        return Promise.resolve([p, inputs]);
    }


    static collapseP(p, opt = (x) => x.firstChild.value) {
        p.innerHTML = [...p.children].reduce((acc, x) => {
            if (!x.className.trim())
                return acc + x.innerHTML;
            else
                return acc + opt(x);
        }, "");
        return p;
    }
}
