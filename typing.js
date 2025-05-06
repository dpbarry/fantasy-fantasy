
export function typeOn(text, body, callback) {
    // first add all the characters invisibly to establish justified alignment
    [...text].forEach(c => {
        let span = document.createElement("span");
        span.innerText = c;
        span.style.color = "transparent";
        span.style.pointerEvents = "none";
        span.style.userSelect = "none";
        body.appendChild(span);
    });

    // now gradually "type" each character
    let count = 0;
    while (count < text.length) {
        let span = body.children[count++];
        setTimeout ( () => {
            span.style.color = "";
            span.style.pointerEvents = "";
            span.style.userSelect = "";

        }, count * 15);
    }

    // run callback, if any, after last character has been typed
    setTimeout(callback, 15 * text.length);
}

// convenience function to abstract the <p> created in a message
export function typeP(text, body, callback = (p) => {}) {
    let p = document.createElement("p");
    body.appendChild(p);
    typeOn(text, p, () => callback(p));
}


// expects a string with @ representing inputs
export async function typePWithInputs(body, string, width, ids, cb, externalCB) {
    let p = document.createElement("p");
    body.appendChild(p);
    [...string].forEach(c => {
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

    const delay = ms => new Promise(res => setTimeout(res, ms));
    const waitForEvent = (el, ev) => new Promise(res =>
        el.addEventListener(ev, function h(e) {
            el.removeEventListener(ev, h);
            res(e);
        })
    );

    let inputIndex = 0;
    let inputs = [];

    for (const [idx, span] of [...p.children].entries()) {
        await delay(15);

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





export function collapseP(p, opt = () => {}) {
    let text = [...p.children].reduce( (acc, x) => {
        if (!x.className.trim())
            return acc + x.innerHTML;
        else
            return acc + opt(x.firstChild.value);
    }, "");
    p.innerHTML = text;
}
