import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";
import {delay} from "../Utils.js";
import createHintBox from "../UI/Components/HintBox.js";

export default function Prologue(ctx) {
    return {
        beginPrologue: async () => {
            ctx.checkpoint(0);
            ctx.core.clock.pause();
            ctx.typeWithInputs("You jolt awake, your head spinning. What a wild dream that must have been. You can hardly even remember your own name... But of course, it is @ @!", "5.5em", "getname", InputService.firstlastNameValidate).then(ctx.episodes.Prologue.getName);
        },

        getName: async (res) => {
            const [p, inputs] = res;
            const [inputFirst, inputSecond] = inputs;
            inputs.forEach(i => {
                i.addEventListener("blur", (e) => {
                    if (!e.relatedTarget?.closest("#story input, dialog")) i.focus({preventScroll: true});
                })
            });
            ctx.core.ui.center.classList.add("alphaactive");

            const finishGetName = async () => {
                ctx.core.mc.setName(inputFirst.value, inputSecond.value);
                ctx.core.clock.resume();
                ctx.core.ui.news.classList.add("shown");
                ctx.core.news.update("You woke up from a strange dream.");
                let n = 0;

                await InputService.clearInput(p);
                TypingService.collapseP(p, i => `<span class='getname settled' style='display: inline-block; text-align: center; 
               width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
               transition: width 0.2s;'>${i.firstChild.value}</span>`);

                document.querySelectorAll(".getname").forEach(el => {
                    el.style.width = InputService.getTrueWidthName(ctx.core.ui.story, el.innerText) + "px";
                    el.ontransitionend = () => (el.style.width = "min-content");
                });

                await delay(200);
                await ctx.episodes.Prologue.getGender();
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

            ctx.typeWithSpans("You roll out of bed, suddenly filled with anticipation. The past week has been a blur of funerals and ceremonies, but it has finally arrived: your first day on the job as the @ / @ of your city.", ["king", "queen"], ["kingChoice", "queenChoice"]).then(([p, spans]) => {
                const [kingChoice, queenChoice] = spans;
                [kingChoice, queenChoice].forEach(c => {
                    c.onclick = () => {
                        kingChoice.classList.remove("selected");
                        queenChoice.classList.remove("selected");
                        c.classList.add("selected");
                    };
                });

                const finishGetGender = () => {
                    const hinge = [...p.children].find(span => span.innerText === "/");
                    hinge.classList.add("hide");
                    hinge.previousElementSibling.classList.add("hide");
                    hinge.nextElementSibling.classList.add("hide");
                    p.querySelector(".kingChoice:not(.selected), .queenChoice:not(.selected)")
                        .classList.add("hide");

                    const selected = p.querySelector(".kingChoice.selected, .queenChoice.selected");
                    ctx.core.mc.gender = selected.innerText === "king" ? "M" : "F";


                    InputService.clearInput(p, ".kingChoice, .queenChoice").then(() => {
                        setTimeout(() => {
                            TypingService.collapseP(p, i => i.classList.contains("selected") ? `<span class='settled' style='font-weight: 515; display: inline-block; 
                    color: var(--accent)'>${i.innerText}</span>` : "");
                            ctx.episodes.Prologue.getSpecialty();
                        }, 150);
                    });
                };

                ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetGender()));
            });
        },

        getSpecialty: async () => {
            ctx.checkpoint(2);
            let res = await ctx.typeWithChoices(`As you throw on some suitably regal clothes, you find yourself wondering whether you will make a good ${ctx.core.mc.genderSwitch("king", "queen")}. You do already know what your strong suit will be:`, ["leading the people to economic prosperity", "waging fierce military campaigns", "spearheading fortuitous new discoveries"]);
            ctx.recordChoice(res.i);

            await ctx.episodes.Prologue.specialtyHint();
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
                        return ["+10 @", ["Savvy"], ["term"], ["savvy"]];
                    case 1:
                        chosenSpecialty = "Valor";
                        ctx.core.mc.valor = 10;
                        return ["+10 @", ["Valor"], ["term"], ["valor"]];
                    case 2:
                        chosenSpecialty = "Wisdom";
                        ctx.core.mc.wisdom = 10;
                        return ["+10 @", ["Wisdom"], ["term"], ["wisdom"]];
                }
            })());

            const box = createHintBox(ctx.core.ui.story, "Many things in the game can be hovered over or tapped to show a tooltip. Try it now on @! For more in-depth information, see the @.", [chosenSpecialty, "Codex"], ["term", "codexWord term"], [chosenSpecialty.toLowerCase()]);

            await delay(1000);

            ctx.core.ui.story.append(InputService.getCue("Enter", () => {
                box.destroy().then(() => ctx.episodes.Prologue.getCityName());
            }, true));
        },

        getCityName: async () => {
            ctx.checkpoint(4);
            let name;
            ctx.typeWithInputs("You leave your bedroom and begin walking down the corridor, admiring through the windows the sweeping views of your hometown afforded by the castle’s hilltop vantage point. It is a small but proud city (by the name of @), nestled between the forest and the sea.", "5.5em", "getname", InputService.nameValidate).then(res => {
                const [p, inputs] = res;
                name = inputs[0];
                name.addEventListener("blur", (e) => {
                    if (!e.relatedTarget?.closest("#story input, dialog")) name.focus({preventScroll: true})
                });
                ctx.core.ui.center.classList.add("alphaactive");
                ctx.core.ui.story.append(InputService.getCue("Enter", () => finishGetCityName(p)));
                setTimeout(() => name.focus({preventScroll: true}), 0);
            });

            const finishGetCityName = p => {
                ctx.core.city.name = name.value;
                InputService.clearInput(p).then(async () => {
                    TypingService.collapseP(p, i => `<span class='getname settled' style='display: inline-block; text-align: center; 
               width: ${p.querySelector(".getname").getBoundingClientRect().width}px; 
               transition: width 0.2s;'>${i.firstChild.value}</span>`);
                    let settledName = p.querySelector(".getname");
                    settledName.style.width = InputService.getTrueWidthName(ctx.core.ui.story, settledName.innerText) + "px";
                    settledName.ontransitionend = () => (settledName.style.width = "min-content");
                    await delay(225);
                    await ctx.episodes.Prologue.beginUpheaval();
                });
            };
        },

        beginUpheaval: async () => {
            ctx.checkpoint(5);
            await ctx.typeP(`Out of nowhere, the floor heaves, knocking you off your feat. Outside, the sky explodes into a kaleidoscope of surreal colors and the land beyond ${ctx.core.city.name} transforms. The events of your dream—or rather, your vision—rush back to you:`);
            await ctx.typeP("The long prophecied Cataclysm has arrived.", {italic: true});
            await ctx.typeP("The creator of the universe has perished, and his limitless power has been scattered across the cosmos, rewriting the laws of reality along the way.", {italic: true});
            await ctx.typeP("Some of that power has found its home in you.", {italic: true});

            await ctx.episodes.Prologue.cueBegin();
        },

        cueBegin: async () => {
            ctx.checkpoint(6);
            ctx.core.ui.story.appendChild(InputService.getButton("Begin Game", "beginGame", async () => {
                await delay(200);
                ctx.core.industry.access.basic = true;
                document.querySelector("#industrynav").classList.remove("locked");
                ctx.core.ui.show("center", "industry")
            }));
        },

        runFrom: async (phase) => {
            switch (phase) {
                case 0:
                    await ctx.episodes.Prologue.beginPrologue();
                    break;
                case 1:
                    await ctx.episodes.Prologue.getGender();
                    break;
                case 2:
                    await ctx.episodes.Prologue.getSpecialty();
                    break;
                case 3:
                    await ctx.episodes.Prologue.specialtyHint();
                    break;
                case 4:
                    await ctx.episodes.Prologue.getCityName();
                    break;
                case 5:
                    await ctx.episodes.Prologue.beginUpheaval();
                    break;
                case 6:
                    await ctx.episodes.Prologue.cueBegin();
                    break;
            }
        }
    }
};