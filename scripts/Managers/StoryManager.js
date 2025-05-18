import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";

export default class StoryManager {
    constructor(core) {
        this.core = core;
        this.storyProg = {
            tutorial: 0
        };
        this.storyText = {
            tutorial: ""
        }
        core.registerSaveableComponent('story', this);
    }

    async typePWithInputs(text, width, ids, cb) {
        return TypingService.typePWithInputs(text, this.core.ui.story, width, ids, cb);
    }

    async typePWithSpans(text, spanIDs, spanTexts) {
        return TypingService.typePWithSpans(text, this.core.ui.story, spanIDs, spanTexts);
    }

    typeP(text) {
        TypingService.typeP(text, this.core.ui.story);
    }

    typePWithChoices(text, choices) {
        return TypingService.typePWithChoices(text, this.core.ui.story, choices);
    }

    async beginTutorial() {
        this.core.clock.pause();
        this.typePWithInputs('You jolt awake, your head spinning. What a wild dream that must have been. ' + 'You can hardly even remember your own name... But of course, it is @ @!', "5.5em", ["getFirstName", "getLastName"], InputService.nameValidate).then(this.getName.bind(this));
    }

    async getName(res) {
        let [p, inputs] = res;
        const inputFirst = inputs[0];
        const inputSecond = inputs[1];

        const finishGetName = () => {
            this.core.ui.unlockPanel(this.core.ui.news).then(() => {
                this.core.clock.resume();
                this.core.news.update("You wake up from a strange dream.");
                this.core.mc.unlockStatus(inputFirst.value, inputSecond.value);
                let n = 0;
                // collapse both the unnecessary spans and the inputs so they mesh with the text
                InputService.clearInput(p).then(() => {
                    TypingService.collapseP(p, (i) => `<span class='fakegetname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
                    width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
                    transition: width 0.2s;'>` + i.firstChild.value + "</span>");
                    document.querySelectorAll(".fakegetname").forEach(n => {
                        n.style.width = InputService.getTrueWidthName(this.core.ui.story, n.innerText) + "px";
                        n.ontransitionend = () => n.style.width = "min-content";
                    });
                    this.getGender();
                });
            });
        };

        this.core.ui.story.append(InputService.getCue("Enter", () => finishGetName()));

        inputFirst.addEventListener("keydown", (e) => {
            if (e.key === " ") {
                e.preventDefault();
                inputSecond.focus();
            }
        });

        inputFirst.focus();

    }

    async getGender() {
        this.storyProg.tutorial = 1;

        setTimeout(async () => {
            this.storyText.tutorial = this.textSnapshot();

            this.typePWithSpans("You roll out of bed, " + "hoping you haven’t missed the first bell. Your father said the meeting today had to be as " + "early as possible. Maybe that explained the odd sleep: you had a suspicion that this might be " + "The Meeting, the one long awaited by any firstborn @ / @ of a king.", ["sonChoice", "daughterChoice"], ["son", "daughter"]).then(([p, spans]) => {
                let [sonChoice, daughterChoice] = spans;
                [sonChoice, daughterChoice].forEach(c => {
                    c.onclick = () => {
                        if (c.parentNode.querySelector(".selected")) c.parentNode.querySelector(".selected").classList.remove("selected");
                        c.classList.add("selected");
                    };
                    c.onpointerdown = () => c.classList.add("nudged");
                });

                const finishGetGender = () => {
                    let hinge = [...p.children].find(span => span.innerText === "/");
                    hinge.classList.add("hide");
                    hinge.previousElementSibling.classList.add("hide");
                    hinge.nextElementSibling.classList.add("hide");
                    p.querySelector("#sonChoice:not(.selected), #daughterChoice:not(.selected)").classList.add("hide");

                    let selected = p.querySelector("#sonChoice.selected, #daughterChoice.selected");
                    let color;
                    if (selected.innerText === "son") {
                        color = "hsl(200, 70%, 80%)";
                        this.core.mc.gender = "M";
                    } else {
                        color = "hsl(330, 70%, 80%)";
                        this.core.mc.gender = "F";
                    }
                    InputService.clearInput(p, "#sonChoice, #daughterChoice").then(() => {
                        setTimeout(() => {
                            TypingService.collapseP(p, (i) => i.classList.contains("selected") ? `<span class='settled' style='font-size: 0.9em; display: inline-block; 
                    font-family: Vinque, serif; color: ${color}'>${i.innerText}</span>` : "");
                            this.getSpecialty();
                        }, 150);

                    });
                };
                this.core.ui.story.append(InputService.getCue("Enter", () => finishGetGender()));
            });
        }, 200);
    }

    async getSpecialty() {
        this.storyProg.tutorial = 2;
        this.storyText.tutorial = this.textSnapshot();
        await this.typePWithChoices("After throwing on some clothes, you check your reflection in the mirror, wondering " + `if you will make a good ${this.core.mc.genderSwitch("king", "queen")}. You do ` + "already know what your strong suit will be:", ["leading the people to " + "economic prosperity", "waging fierce military campaigns", "spearheading fortuitous " + "new discoveries"]).then(res => {
            TypingService.choiceNote(res.el, ...(function () {
                switch (res.i) {
                    case 0:
                        return ["+10 @", ["savvyWord"], ["savvy"]];
                    case 1:
                        return ["+10 @", ["valorWord"], ["valor"]];
                    case 2:
                        return ["+10 @", ["wisdomWord"], ["wisdom"]];
                }
            })());
        });
    }

    textSnapshot() {
        return this.core.ui.story.innerHTML;
    }

    async tutorialResumeFrom(phase) {
        this.core.ui.story.innerHTML = this.storyText.tutorial;
        switch (phase) {
            case 0:
                await this.beginTutorial();
                break;
            case 1:
                await this.getGender();
                break;
            case 2:
                await this.getSpecialty();
                break;
        }
    }

    serialize() {
        return {
            storyProg: this.storyProg, storyText: this.storyText
        };

    }

    deserialize(data) {
        this.storyProg = data.storyProg;
        this.storyText = data.storyText;

        if (this.storyProg.tutorial >= 1) {
            this.core.news.renderNews();
        }

        if (this.storyProg.tutorial !== -1) this.tutorialResumeFrom(this.storyProg.tutorial);
    }
}


