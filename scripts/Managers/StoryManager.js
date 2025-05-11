import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";

export default class StoryManager {
    constructor(core) {
        this.core = core;
        core.registerSaveableComponent('story', this);
    }

    async typePWithInputs(text, width, ids, cb) {
        return TypingService.typePWithInputs(text, this.core.ui.story, width, ids, cb);
    }

    async typePWithSpans(text, spanIDs, spanTexts) {
        return TypingService.typePWithSpans(text, this.core.ui.story, spanIDs, spanTexts);
    }

    async beginTutorial() {
        this.core.clock.pause();
        this.typePWithInputs('You jolt awake, your head spinning. What a wild dream that must have been. '+
            'You can hardly even remember your own name... But of course, it is @ @!',
            "5.5em", ["getFirstName", "getLastName"],
            InputService.nameValidate).then(this.getName.bind(this));
    }

    async getGender(p, inputs) {
        this.core.ui.unlockPanel(this.core.ui.news).then(() => {
            this.core.clock.resume();
            this.core.ui.pushUpdate("You wake up from a strange dream.");
            this.core.mc.unlock(inputs[0].value, inputs[1].value);
            let n = 0;
            // collapse both the unnecessary spans and the inputs so they mesh with the text
            InputService.clearInput(p).then(() => {
                TypingService.collapseP(p, (i) =>
                    `<span class='fakegetname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
                    width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
                    transition: width 0.2s;'>` + i.firstChild.value + "</span>"
                );
                document.querySelectorAll(".fakegetname").forEach(n => {
                    n.style.width = InputService.getTrueWidthName(this.core.ui.story, n.innerText) + "px";
                    n.ontransitionend = () => n.style.width = "min-content";
                });

                setTimeout(async () => {
                    this.typePWithSpans("You roll out of bed, "+
                        "hoping you haven’t missed the first bell. Your father said the meeting today had to be as "+
                        "early as possible. Maybe that explained the odd sleep: you had a suspicion that this might be "+
                        "The Meeting, the one long awaited by any firstborn @ / @ of a king.",
                        ["sonChoice", "daughterChoice"], ["son", "daughter"]).then(([p, spans]) => {
                        let [sonChoice, daughterChoice] = spans;
                        [sonChoice, daughterChoice].forEach(c => {
                            c.onclick = () => {
                                if (c.parentNode.querySelector(".selected"))
                                    c.parentNode.querySelector(".selected").classList.remove("selected");
                                c.classList.add("selected");
                            };
                            c.onpointerdown = () => c.classList.add("nudged");
                        });

                        this.core.ui.story.append(InputService.getCue("Enter", () => this.getAppearance(p)));
                    });
                }, 200);
            });
        });

    }

    async getAppearance(p) {
        let hinge = [...p.children].find(span => span.innerText === "/");
        hinge.classList.add("hide");
        hinge.previousElementSibling.classList.add("hide");
        hinge.nextElementSibling.classList.add("hide");
        p.querySelector("#sonChoice:not(.selected), #daughterChoice:not(.selected)").classList.add("hide");

        let selected = p.querySelector("#sonChoice.selected, #daughterChoice.selected");
        let color;
        if (selected.innerText === "son") {
            color = "hsl(200, 70%, 80%)";
        } else {
            color = "hsl(330, 70%, 80%)";
        }
        selected.classList.add("settled");
        setTimeout(() => {
            InputService.clearInput(p,"#sonChoice, #daughterChoice");
                TypingService.collapseP(p, (i) => i.classList.contains("selected") ?
                    `<span class='settled' style='font-size: 0.9em; display: inline-block; 
                    font-family: Vinque, serif; color: ${color}'>${i.innerText}</span>`  : "");
        }, 200);
    }


    async getName(res) {
        let [p, inputs] = res;
        const inputFirst = inputs[0];
        const inputSecond = inputs[1];
        this.core.ui.story.append(InputService.getCue("Enter", () => this.getGender(p, inputs)));

        inputFirst.addEventListener("keydown", (e) => {
            if (e.key === " ") {
                e.preventDefault();
                inputSecond.focus();
            }
        });

        inputFirst.focus();

        inputFirst.onblur = (e) => {
            if (e.relatedTarget !== inputSecond) inputFirst.focus();
        };
        inputSecond.onblur = (e) => {
            if (e.relatedTarget !== inputFirst) inputSecond.focus()
        };


    }

    serialize() {

    }

    deserialize(data) {

    }
}



