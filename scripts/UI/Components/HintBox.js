import TypingService from "../Services/TypingService.js";
import { waitForEvent} from "../../Utils.js";

export default function createHintBox(el, msg, spanIDs = [], spanTexts = [], spanClasses = [], spanTips = []) {
    const box = document.createElement('div');
    const text = document.createElement('div');
    box.className = 'hintbox';
    box.appendChild(text);
    el.appendChild(box);

    TypingService.typeWithSpans(msg, text, spanIDs, spanTexts, spanClasses, spanTips).then(([body]) => {
        TypingService.collapseP(body);
    });

    return {
        destroy: async () => {
            box.style.transitionDuration = '0.2s';
            box.style.opacity = '0';
            box.style.translate = '0 0.5em';
            return waitForEvent(box, "transitionend", 200).then(() => {
                box.remove();
                return Promise.resolve();
            })
        }
    };
}