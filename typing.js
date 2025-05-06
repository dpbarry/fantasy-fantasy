const TYPE_DELAY = 10;
export async function typeOn(text, body, callback = () => {}) {
    // first add all the characters invisibly to establish justified alignment
    await hideText(text, body);

    // now gradually "type" each character
    await renderText(body);

    // run callback, if any, after last character has been typed
    callback();
}

// convenience function to abstract the <p> created in a message
export async function typeP(text, body, callback = () => {}) {
    let p = document.createElement("p");
    body.appendChild(p);
    await typeOn(text, p, () => callback(p));
}

async function renderText(p) {
    for (const span of [...p.children]) {
        if (span.classList.contains("deep")) {
            await renderText(span);
            span.classList.add("visible");
        } else {
            await delay(TYPE_DELAY);
            Object.assign(span.style, {
                color:         "",
                pointerEvents: "",
                userSelect:    ""
            });
        }
    }
}
function hideText(text, body) {
    [...text].forEach(c => {
        let span = document.createElement("span");
        span.innerText = c;
        span.style.color = "transparent";
        span.style.pointerEvents = "none";
        span.style.userSelect = "none";
        body.appendChild(span);
    });
}

export async function typePWithSpans(text, body, spanIDs, spanTexts, callback = () => {}) {
    let p = document.createElement("p");
    body.appendChild(p);
    let spans = [];
    
    let count = 0;
    [...text].forEach(c => {
        let span = document.createElement("span");
        if (c === "@") {
            span.classList.add("deep");
            span.id = spanIDs[count];
            hideText(spanTexts[count++], span);
            spans.push(span);
        } else {
            span.style.color = "transparent";
            span.style.pointerEvents = "none";
            span.style.userSelect = "none";
            span.innerText = c;
        }
        p.appendChild(span);

    });

    await renderText(p);

    
    p.querySelectorAll(".deep").forEach(collapseP);
    return spans;
}


// expects a string with @ representing inputs
export async function typePWithInputs(body, text, width, ids, cb, externalCB) {
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
        await delay(TYPE_DELAY);

        if (span.className === "inputwrap") {
            const input = document.createElement("input");
            input.id           = ids[inputIndex++];
            input.autocomplete = "off";
            input.inputMode    = "none";
            input.spellcheck   = false;
            input.oninput      = cb;
            input.onfocus      = () => document.body.classList.add("keyboardactive");
            input.onblur      = (e) => {
                if (!e.relatedTarget?.closest("#alphaboard, #numboard")) document.body.classList.remove("keyboardactive");
                else
                    e.target.focus();
            };
            
            input.onanimationend = () => input.classList.remove("invalid");

            inputs.push(input);
            span.appendChild(input);

            await waitForEvent(input, "transitionend");
        }
        else {
            Object.assign(span.style, {
                color:         "",
                pointerEvents: "",
                userSelect:    ""
            });
        }
    }

    externalCB(p, inputs);
}





export function collapseP(p, opt = (x) => {x.firstChild.value}) {
    let text = [...p.children].reduce( (acc, x) => {
        if (!x.className.trim())
            return acc + x.innerHTML;
        else
            return acc + opt(x);
    }, "");
    p.innerHTML = text;
    return p;
}

const delay = ms => new Promise(res => setTimeout(res, ms));
const waitForEvent = (el, ev) => new Promise(res =>
    el.addEventListener(ev, function h(e) {
        el.removeEventListener(ev, h);
        res(e);
    })
);
