import TypingService from "../Services/TypingService.js";
import {waitForEvent} from "../../Utils.js";

export default function createHintBox(el, msg, spanTexts = [], spanClasses = [], spanTips = []) {
    const box = document.createElement('div');
    const text = document.createElement('div');
    box.className = 'hintbox';
    box.appendChild(text);
    el.appendChild(box);

    TypingService.typeWithSpans(msg, text, spanTexts, spanClasses, spanTips).then(([body]) => {
        TypingService.collapseP(body);
    });

    return {
        destroy: async () => {
            box.style.transitionDuration = '0.2s';
            box.style.opacity = '0';
            box.style.translate = '0 0.5em';
            return waitForEvent(box, "transitionend", 200).then(() => {
                let parent = box.parentElement;
                if (parent._scrollObserver) {
                    parent._scrollObserver.disconnect();
                    const addedHeight = box.getBoundingClientRect().height;
                    const currentPad = parseFloat(getComputedStyle(parent).paddingBottom) || 0;
                    parent.style.paddingBottom = `${currentPad + addedHeight}px`;
                    parent._excessPadding += addedHeight;
                    box.remove();
                    parent._scrollObserver.observe(parent, {
                        childList: true, subtree: true, characterData: true
                    });
                    return Promise.resolve();
                }

                box.remove();
                return Promise.resolve();
            })
        }
    };
}