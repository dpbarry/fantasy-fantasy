export async function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

export async function waitForEvent(el, ev, escape= 0) {
    return new Promise(res => {
        let timeoutId;

        const handler = function h(e) {
            if (timeoutId) clearTimeout(timeoutId);
            el.removeEventListener(ev, h);
            res(e);
        };

        if (escape > 0) {
            if (typeof escape === 'number') {
                timeoutId = setTimeout(() => {
                    el.removeEventListener(ev, handler);
                    res(null);
                }, escape);
            }
        }
        el.addEventListener(ev, handler);
    });

}

export function verticalScroll(el, moe, respectPadding= false) {
    el.style.overflowY = "auto";
    let clientHeight = el.clientHeight;
    if (respectPadding) {
        const computedStyle = window.getComputedStyle(el);
        const paddingTop = parseFloat(computedStyle.paddingTop);
        const paddingBottom = parseFloat(computedStyle.paddingBottom);
        clientHeight -= (paddingTop + paddingBottom);
    }
    const isScrollable = (el.scrollHeight > clientHeight + 1);
    if (!isScrollable) {
        el.style.maskImage = "";
        el.style.overflow = "visible";
        return;
    }
    el.style.overflowY = "auto";

    // One pixel is added to the height to account for non-integer heights.
    const isScrolledToBottom = el.scrollHeight < clientHeight + el.scrollTop + moe;
    const isScrolledToTop = isScrolledToBottom ? false : el.scrollTop < moe;

    let top = 0;
    let bottom = 0;

    if (!isScrolledToBottom) {
        bottom = el.dataset.masksize || 40;
    }

    if (!isScrolledToTop) {
        top = el.dataset.masksize || 40;
    }

    el.style.maskImage = `linear-gradient(to bottom, transparent 0, black ${top}px, black calc(100% - ${bottom}px), transparent 100%)`;
}
