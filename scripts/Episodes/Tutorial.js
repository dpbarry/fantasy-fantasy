import InputService from "../UI/Services/InputService.js";
import TypingService from "../UI/Services/TypingService.js";
import {delay, unlockPanel} from "../Utils.js";
import createHintBox from "../UI/Components/HintBox.js";

export default function Tutorial(ctx) {
    return {
        beginTutorial: async () => {
            ctx.checkpoint(0);
            ctx.core.clock.pause();
            ctx.typeWithInputs('You jolt awake, your head spinning. What a wild dream that must have been. ' + 'You can hardly even remember your own name... But of course, it is @ @!', "5.5em", "getname", InputService.firstlastNameValidate).then(ctx.episodes.Tutorial.getName);
        },

        getName: async (res) => {
            const [p, inputs] = res;
            const [inputFirst, inputSecond] = inputs;

            const finishGetName = async () => {
                unlockPanel(ctx.core.ui.news).then(async () => {
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

                    await delay(200);
                    await ctx.episodes.Tutorial.getGender();
                });
            };

            ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetName()));

            inputFirst.addEventListener("keydown", (e) => {
                if (e.key === " ") {
                    e.preventDefault();
                    inputSecond.focus({preventScroll: true});
                }
            });

            setTimeout(() => inputFirst.focus({preventScroll: true}), 0);
        },

        getGender: async () => {
            ctx.checkpoint(1);

            ctx.typeWithSpans("You roll out of bed, " + "hoping you haven’t missed the first bell. Your father said the meeting today had to be as " + "early as possible. Maybe that explained the odd sleep—you had a suspicion that this might be " + "“The Meeting,” the one long awaited by any firstborn @ / @ of a king.", ["son", "daughter"], ["sonChoice", "daughterChoice"]).then(([p, spans]) => {
                const [sonChoice, daughterChoice] = spans;
                [sonChoice, daughterChoice].forEach(c => {
                    c.onclick = () => {
                        sonChoice.classList.remove("selected");
                        daughterChoice.classList.remove("selected");
                        c.classList.add("selected");
                    };
                    c.onpointerdown = () => c.classList.add("nudged");
                });

                const finishGetGender = () => {
                    const hinge = [...p.children].find(span => span.innerText === "/");
                    hinge.classList.add("hide");
                    hinge.previousElementSibling.classList.add("hide");
                    hinge.nextElementSibling.classList.add("hide");
                    p.querySelector(".sonChoice:not(.selected), .daughterChoice:not(.selected)")
                        .classList.add("hide");

                    const selected = p.querySelector(".sonChoice.selected, .daughterChoice.selected");
                    let color;
                    if (selected.innerText === "son") {
                        color = "hsl(200, 70%, 80%)";
                        ctx.core.mc.gender = "M";
                    } else {
                        color = "hsl(330, 70%, 80%)";
                        ctx.core.mc.gender = "F";
                    }

                    InputService.clearInput(p, ".sonChoice, .daughterChoice").then(() => {
                        setTimeout(() => {
                            TypingService.collapseP(p, i => i.classList.contains("selected") ? `<span class='settled' style='font-size: 0.9em; display: inline-block; 
                     font-family: Vinque, serif; color: ${color}'>${i.innerText}</span>` : "");
                            ctx.episodes.Tutorial.getSpecialty();
                        }, 150);
                    });
                };

                ctx.core.ui.screens.story.root.append(InputService.getCue("Enter", () => finishGetGender()));
            });
        },

        getSpecialty: async () => {
            ctx.checkpoint(2);
            let res = await ctx.typeWithChoices("After throwing on some clothes, you check your reflection in the mirror. Presentable enough. No point in overdressing for what might just be a run-of-the-mill meeting. Still, you find yourself wondering " + `whether you will make a good ${ctx.core.mc.genderSwitch("king", "queen")}. You do already know what your strong suit would be:`, ["leading the people to economic prosperity", "waging fierce military campaigns", "spearheading fortuitous new discoveries"]);
            ctx.recordChoice(res.i);

            await ctx.episodes.Tutorial.specialtyHint();
        },

        specialtyHint: async () => {
            ctx.checkpoint(3);
            let choice = ctx.getLastChoice();
            let chosenSpecialty;

            await ctx.choiceNote(...(() => {
                switch (choice) {
                    case 0:
                        chosenSpecialty = "Savvy";
                        ctx.core.mc.savvy = 10;
                        return ["+10 @", ["Savvy"], ["savvyWord term"], ["savvy"]];
                    case 1:
                        chosenSpecialty = "Valor";
                        ctx.core.mc.valor = 10;
                        return ["+10 @", ["Valor"], ["valorWord term"], ["valor"]];
                    case 2:
                        chosenSpecialty = "Wisdom";
                        ctx.core.mc.wisdom = 10;
                        return ["+10 @", ["Wisdom"], ["wisdomWord term"], ["wisdom"]];
                }
            })());

            const box = createHintBox(ctx.core.ui.screens.story.root, "Many things in the game can be hovered over or tapped to show a tooltip. Try it now on @! For more in-depth information, see the @.", [chosenSpecialty, "Codex"], ["term " + chosenSpecialty.toLowerCase() + "Word", "codexWord term click"], [chosenSpecialty.toLowerCase()]);

            await delay(1000);

            ctx.core.ui.screens.story.root.append(InputService.getCue("Enter", () => {
                box.destroy().then(() => ctx.episodes.Tutorial.getCityName());
            }, true));
        },

        getCityName: async () => {
            ctx.checkpoint(4);
            let name;
            ctx.typeWithInputs("You leave your bedroom and begin walking down the corridor. The walls are lined with grand paintings and statues of yesteryear’s kings and queens. Here and there, windows offer up sweeping views of your hometown from the castle’s hilltop vantage point. It is a small but proud city (named @), inhabited by honest farmers and artisans.", "5.5em", "getname", InputService.nameValidate).then(res => {
                const [p, inputs] = res;
                name = inputs[0];
                ctx.core.ui.screens.story.root.append(InputService.getCue("Enter", () => finishGetCityName(p)));
                setTimeout(() => name.focus({preventScroll: true}), 0);
            });

            const finishGetCityName = p => {
                InputService.clearInput(p).then(async () => {
                    TypingService.collapseP(p, i => `<span class='getname settled' style='font-size: 0.9em; display: inline-block; text-align: center; 
               width: ${p.querySelector(".getname").getBoundingClientRect().width}px; 
               transition: width 0.2s;'>${i.firstChild.value}</span>`);
                    let settledName = p.querySelector(".getname");
                    settledName.style.width = InputService.getTrueWidthName(ctx.core.ui.story, settledName.innerText) + "px";
                    settledName.ontransitionend = () => (settledName.style.width = "min-content");
                    await delay(225);
                    ctx.core.city.unlockCityHeader(name.value)
                    await ctx.episodes.Tutorial.meetTercius();
                });
            };
        },


        meetTercius: async () => {
            ctx.checkpoint(5);
            await ctx.typeP("You turn a corner and nearly barrel into the butler, Tercius.");
            let res = await ctx.typeWithChoices(`“Excuse me, ${ctx.core.mc.firstName}! I trust you’re heading to the meeting? Would like you like me to bring some refreshments there?”`, ["“Good morning Tercius. Some tea might be nice. How are you?”", "“Let’s make it a feast old boy! Quiche, scones, cakes, you get the picture. Oh, and don't forget some port.”", "“No. Out of my way.”"]);
            ctx.recordChoice(res.i);
            ctx.recordFact("meetingFood", res.i === 0 ? "tea" : res.i === 1 ? "feast" : "nothing")
            switch (res.i) {
                case 0:
                    ctx.core.mc.bonds.tercius += 5;
                    break;
                case 1:
                    ctx.core.mc.bonds.daphna -= 5;
                    break;
                case 2:
                    ctx.core.mc.bonds.tercius -= 5;
                    break;
            }
            await ctx.episodes.Tutorial.terciusResponse();
        },

        terciusResponse: async () => {
            ctx.checkpoint(6);
            let choice = ctx.getLastChoice();
            switch (choice) {
                case 0:
                    await ctx.choiceNote("+5 @ with @", ["Bond", "Tercius"], ["bondWord term", "name"], ["bond", "tercius"]);
                    await ctx.typeP("Tercius smiles. “I’m very well, thanks. I’ll get that tea going.” He whisks away, as fleet-footed as always.");
                    break;
                case 1:
                    await ctx.choiceNote("-5 @ with @", ["Bond", "Daphna"], ["bondWord term", "name"], ["bond", "daphna"]);
                    await ctx.typeP("Tercius chuckles. “I’ll see to it, but you know Daphna won’t be pleased at this hour!” He whisks away, as fleet-footed as always.")
                    break;
                case 2:
                    await ctx.choiceNote("-5 @ with @", ["Bond", "Tercius"], ["bondWord term", "name"], ["bond", "tercius"]);
                    await ctx.typeP("“By all means,” he says frostily. The impediment dealt with, you continue on your way. ")
                    break;
            }

          //  await ctx.episodes.Tutorial.startMeeting();
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
                    await ctx.episodes.Tutorial.specialtyHint();
                    break;
                case 4:
                    await ctx.episodes.Tutorial.getCityName();
                    break;
                case 5:
                    await ctx.episodes.Tutorial.meetTercius();
                    break;
                case 6:
                    await ctx.episodes.Tutorial.terciusResponse();
                    break;
            }
        }
    }
};