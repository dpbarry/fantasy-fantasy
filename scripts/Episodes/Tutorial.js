import GeneralService from "../Services/GeneralService.js";
import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";

export default function Tutorial(ctx) {
    return {
        beginTutorial: async () => {
            ctx.core.clock.pause();
            ctx.typePWithInputs('You jolt awake, your head spinning. What a wild dream that must have been. ' + 'You can hardly even remember your own name... But of course, it is @ @!', "5.5em", "getname", InputService.firstlastNameValidate).then(ctx.episodes.Tutorial.getName);
        },

        getName: async (res) => {
            let [p, inputs] = res;
            const [inputFirst, inputSecond] = inputs;

            const finishGetName = async () => {
                ctx.core.ui.unlockPanel(ctx.core.ui.news).then(async () => {
                    ctx.core.clock.resume();
                    ctx.core.news.update("You woke up from a strange dream.");
                    ctx.core.mc.unlockStatus(inputFirst.value, inputSecond.value);
                    let n = 0;

                    await InputService.clearInput(p);
                    TypingService.collapseP(p, i => `<span class='getname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
               width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
               transition: width 0.2s;'>${i.firstChild.value}</span>`);

                    document.querySelectorAll(".getname").forEach(el => {
                        el.style.width = InputService.getTrueWidthName(ctx.core.ui.story, el.innerText) + "px";
                        el.ontransitionend = () => (el.style.width = "min-content");
                    });

                    await GeneralService.delay(200);
                    await ctx.episodes.Tutorial.getGender();
                });
            };

            ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetName()));

            inputFirst.addEventListener("keydown", (e) => {
                if (e.key === " ") {
                    e.preventDefault();
                    inputSecond.focus();
                }
            });

            inputFirst.focus();
        },

        getGender: async () => {
            ctx.storyProg.Tutorial = 1;
            ctx.storyText.Tutorial = ctx.textSnapshot();

            ctx.typePWithSpans("You roll out of bed, " + "hoping you haven’t missed the first bell. Your father said the meeting today had to be as " + "early as possible. Maybe that explained the odd sleep—you had a suspicion that this might be " + "“The Meeting,” the one long awaited by any firstborn @ / @ of a king.", ["sonChoice", "daughterChoice"], ["son", "daughter"]).then(([p, spans]) => {
                let [sonChoice, daughterChoice] = spans;
                [sonChoice, daughterChoice].forEach(c => {
                    c.onclick = () => {
                        const prev = c.parentNode.querySelector(".selected");
                        if (prev) prev.classList.remove("selected");
                        c.classList.add("selected");
                    };
                    c.onpointerdown = () => c.classList.add("nudged");
                });

                const finishGetGender = () => {
                    let hinge = [...p.children].find(span => span.innerText === "/");
                    hinge.classList.add("hide");
                    hinge.previousElementSibling.classList.add("hide");
                    hinge.nextElementSibling.classList.add("hide");
                    p.querySelector("#sonChoice:not(.selected), #daughterChoice:not(.selected)")
                        .classList.add("hide");

                    let selected = p.querySelector("#sonChoice.selected, #daughterChoice.selected");
                    let color;
                    if (selected.innerText === "son") {
                        color = "hsl(200, 70%, 80%)";
                        ctx.core.mc.gender = "M";
                    } else {
                        color = "hsl(330, 70%, 80%)";
                        ctx.core.mc.gender = "F";
                    }

                    InputService.clearInput(p, "#sonChoice, #daughterChoice").then(() => {
                        setTimeout(() => {
                            TypingService.collapseP(p, i => i.classList.contains("selected") ? `<span class='settled' style='font-size: 0.9em; display: inline-block; 
                     font-family: Vinque, serif; color: ${color}'>${i.innerText}</span>` : "");
                            ctx.episodes.Tutorial.getSpecialty();
                        }, 150);
                    });
                };

                ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetGender()));
            });
        },

        getSpecialty: async () => {
            ctx.storyProg.Tutorial = 2;
            ctx.storyText.Tutorial = ctx.textSnapshot();

            await ctx.typePWithChoices("After throwing on some clothes, you check your reflection in the mirror. Presentable enough. No point in overdressing for what might just be a run-of-the-mill meeting. Still, you find yourself wondering " + `whether you will make a good ${ctx.core.mc.genderSwitch("king", "queen")}. You do ` + "already know what your strong suit would be:", ["leading the people to economic prosperity", "waging fierce military campaigns", "spearheading fortuitous new discoveries"]).then(async (res) => {
                let choice;
                await TypingService.choiceNote(res.el, ...(() => {
                    ctx.storyProg.Tutorial = 3;
                    switch (res.i) {
                        case 0:
                            choice = "Savvy";
                            ctx.core.mc.savvy = 10;
                            return ["+10 @", ["savvyWord"], ["Savvy"], ["term"], ["savvy"]];
                        case 1:
                            choice = "Valor";
                            ctx.core.mc.valor = 10;
                            return ["+10 @", ["valorWord"], ["Valor"], ["term"], ["valor"]];
                        case 2:
                            choice = "Wisdom";
                            ctx.core.mc.wisdom = 10;
                            return ["+10 @", ["wisdomWord"], ["Wisdom"], ["term"], ["wisdom"]];
                    }
                })());

                ctx.storyText.Tutorial = ctx.textSnapshot();

                let box = ctx.core.ui.addHint("Many things in the game can be hovered over or tapped to show a tooltip. Try it now on @! For more in-depth information, see the @.", [choice.toLowerCase() + "Word", ""], [choice, "Codex"], ["term", "codexWord term click"], [choice.toLowerCase()]);

                await GeneralService.delay(1000);

                ctx.core.ui.story.appendChild(InputService.getCue("Enter", () => {
                    box.destroy().then(() => ctx.episodes.Tutorial.getCityName());
                }, true));
            });
        },

        getCityName: async () => {
            let name;
            await ctx.typePWithInputs("You leave your bedroom and begin walking down the corridor. The walls are lined with grand paintings and statues of yesteryear’s kings and queens. Here and there, windows offer up sweeping views of your hometown from the castle’s hilltop vantage point. It is a small but proud city (named @), inhabited by honest farmers and artisans.", "5.5em", "getname", InputService.nameValidate).then(res => {
                let [p, inputs] = res;
                name = inputs[0];
                ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetCityName(p)));
                name.focus();
            });

            const finishGetCityName = p => {
                InputService.clearInput(p).then(async () => {
                    TypingService.collapseP(p, i => `<span class='getname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
               width: ${p.querySelector(".getname").getBoundingClientRect().width}px; 
               transition: width 0.2s;'>${i.firstChild.value}</span>`);
                    let settledName = p.querySelector(".getname");
                    settledName.style.width = InputService.getTrueWidthName(ctx.core.ui.story, settledName.innerText) + "px";
                    settledName.ontransitionend = () => (settledName.style.width = "min-content");
                    await GeneralService.delay(225);
                    await ctx.episodes.Tutorial.goToMeeting();
                });
            };
        },

        goToMeeting: async () => {
            ctx.storyProg.Tutorial = 4;
            ctx.storyText.Tutorial = ctx.textSnapshot();
            ctx.typeP("Soon enough, you arrive outside the royal study. ");
        },

        runFrom: async (phase) => {
            switch (phase) {
                case 0:
                    await ctx.episodes.Tutorial.beginTutorial();
                    break;
                case 1:
                    await ctx.episodes.Tutorial.getGender();
                    break;
                case 2:
                    await ctx.episodes.Tutorial.getSpecialty();
                    break;
                case 3:
                    await ctx.episodes.Tutorial.getCityName();
                    break;
                case 4:
                    await ctx.episodes.Tutorial.goToMeeting();
                    break;
            }
        }
    }
}
