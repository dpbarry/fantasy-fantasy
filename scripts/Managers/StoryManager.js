import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";
import GeneralService from "../Services/GeneralService.js";

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
        this.setupAutoScroll();
    }

    setupAutoScroll() {
        let scrollTimeout;
        const autoScroll = () => {
            clearTimeout(scrollTimeout);

            scrollTimeout = setTimeout(() => {
                const storyEl = this.core.ui.story;
                const lastChild = storyEl.lastElementChild;
                if (!lastChild) return;

                // Check if last element's bottom edge is below the viewport
                const containerRect = storyEl.getBoundingClientRect();
                const lastChildRect = lastChild.getBoundingClientRect();

                // If the bottom of the last child is below the container's visible area
                if (lastChildRect.bottom > containerRect.bottom) {
                    storyEl.scrollTo({
                        top: storyEl.scrollHeight, behavior: 'smooth'
                    });
                }
            }, 100);
        }
        this.observer = new MutationObserver(() => {
            autoScroll();
        });

        window.addEventListener("resize", () => {
            autoScroll();
        })

        this.observer.observe(this.core.ui.story, {
            childList: true, subtree: true, characterData: true
        });
        this.core.ui.story._mutationObserver = this.observer;

    }

    async typePWithInputs(text, width, ids, className, cb, type) {
        return TypingService.typePWithInputs(text, this.core.ui.story, width, ids, className, cb, type);
    }

    async typePWithSpans(text, spanIDs, spanTexts, spanClasses = [], spanTips = []) {
        return TypingService.typePWithSpans(text, this.core.ui.story, spanIDs, spanTexts, spanClasses, spanTips);
    }

    typeP(text) {
        TypingService.typeP(text, this.core.ui.story);
    }

    typePWithChoices(text, choices) {
        return TypingService.typePWithChoices(text, this.core.ui.story, choices);
    }

    async beginTutorial() {
        this.core.clock.pause();
        await GeneralService.delay(300); // might increase for release
        this.typePWithInputs('You jolt awake, your head spinning. What a wild dream that must have been. ' + 'You can hardly even remember your own name... But of course, it is @ @!', "5.5em", ["getFirstName", "getLastName"], "getname", InputService.firstlastNameValidate).then(this.getName.bind(this));
    }

    async getName(res) {
        let [p, inputs] = res;
        const inputFirst = inputs[0];
        const inputSecond = inputs[1];

        const finishGetName = () => {
            this.core.ui.unlockPanel(this.core.ui.news).then(() => {
                this.core.clock.resume();
                this.core.news.update("You woke up from a strange dream.");
                this.core.mc.unlockStatus(inputFirst.value, inputSecond.value);
                let n = 0;
                // collapse both the unnecessary spans and the inputs so they mesh with the text
                InputService.clearInput(p).then(() => {
                    TypingService.collapseP(p, (i) => `<span class='getname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
                    width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
                    transition: width 0.2s;'>` + i.firstChild.value + "</span>");
                    document.querySelectorAll(".getname").forEach(n => {
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

            this.typePWithSpans("You roll out of bed, " + "hoping you haven’t missed the first bell. Your father said the meeting today had to be as " + "early as possible. Maybe that explained the odd sleep—you had a suspicion that this might be " + "“The Meeting,” the one long awaited by any firstborn @ / @ of a king.", ["sonChoice", "daughterChoice"], ["son", "daughter"]).then(([p, spans]) => {
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
        await this.typePWithChoices("After throwing on some clothes, you check your reflection in the mirror. Presentable enough. No point in overdressing for what might just be a run-of-the-mill meeting. Still, you find yourself wondering " + `whether you will make a good ${this.core.mc.genderSwitch("king", "queen")}. You do ` + "already know what your strong suit would be:", ["leading the people to " + "economic prosperity", "waging fierce military campaigns", "spearheading fortuitous " + "new discoveries"]).then(async res => {
            let choice;
            await TypingService.choiceNote(res.el, ...(() => {
                this.storyProg.tutorial = 3; // waste no time progressing to avoid reload shenanigans
                switch (res.i) {
                    case 0:
                        choice = "Savvy";
                        this.core.mc.savvy = 10;
                        return ["+10 @", ["savvyWord"], ["Savvy"], ["term"], ["savvy"]];
                    case 1:
                        choice = "Valor";
                        this.core.mc.valor = 10;
                        return ["+10 @", ["valorWord"], ["Valor"], ["term"], ["valor"]];
                    case 2:
                        choice = "Wisdom";
                        this.core.mc.wisdom = 10;
                        return ["+10 @", ["wisdomWord"], ["Wisdom"], ["term"], ["wisdom"]];
                }
            })());
            this.storyText.tutorial = this.textSnapshot();

            let box = this.core.ui.addHint("Many things in the game can be hovered over or tapped to show a tooltip. Try it now on @! For more in-depth information, see the @.", [choice.toLowerCase() + "Word", ""], [choice, "Codex"], ["term", "codexWord term click"], [choice.toLowerCase()]);

            await GeneralService.delay(1000);

            this.core.ui.story.appendChild(InputService.getCue("Enter", () => {
                box.destroy().then(() => this.getCityName());
            }, true));

        });
    }

    async getCityName() {
        let name;
        await this.typePWithInputs("You leave your bedroom and begin walking down the corridor. Outside, you see @.", "5.5em", ["getCityName"], "getname", InputService.nameValidate).then(res => {
            let [p, inputs] = res;
            name = inputs[0];
            name.focus();
            this.core.ui.story.append(InputService.getCue("Enter", () => finishGetCityName(p)));
        })

        const finishGetCityName = () => {

        }
    }

    textSnapshot() {
        return this.core.ui.story.innerHTML;
    }

    async tutorialResumeFrom(phase) {
        if (phase > 0) await GeneralService.delay(300);
        this.core.ui.story.innerHTML = this.storyText.tutorial;
        this.core.ui.activatePanel(this.core.ui.story);
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
            case 3:
                await this.getCityName();
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


        if (this.storyProg.tutorial !== -1) this.tutorialResumeFrom(this.storyProg.tutorial);
    }
}


