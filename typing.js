
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

export function collapseP(p, opt = () => {}) {
    let text = [...p.children].reduce( (acc, x) => {
        if (x.nodeName === "SPAN")
            return acc + x.innerHTML;
        else
            return acc + opt(x.value);
    }, "");
    p.innerHTML = text;
}
