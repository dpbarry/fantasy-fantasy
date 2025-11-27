import InputService from "../Services/InputService.js";
import TypingService from "../Services/TypingService.js";
import {delay} from "../Utils.js";
import createHintBox from "../UI/Components/HintBox.js";
import createInfoBox from "../UI/Components/InfoBox.js";

export default class StoryManager {
    #running = false;

    constructor(core) {
        this.core = core;
        this.progress = 0;
        this.snapshots = "";
        this.choices = {};
        this.dismissedInfoBoxes = new Set();
    }

    checkpoint(phase) {
        this.progress = phase;
        this.snapshots = this.core.ui.story.innerHTML || "";
    }

    recordChoice(i) {
        this.choices[this.progress] = i;
    }

    getLastChoice() {
        return this.choices[this.progress - 1];
    }

    async typeP(text, opts = {}) {
        return await TypingService.typeP(text, this.core.ui.story, opts);
    }

    async typeWithInputs(text, ...args) {
        return await TypingService.typePWithInputs(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async typeWithSpans(text, ...args) {
        return await TypingService.typePWithSpans(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async typeWithChoices(text, ...args) {
        return await TypingService.typePWithChoices(
            text,
            this.core.ui.story,
            ...args
        );
    }

    async choiceNote(text, ...args) {
        return await TypingService.choiceNote(text, this.core.ui.story, ...args);
    }

    async beginPrologue() {
        this.checkpoint(0);
        this.core.clock.pause();
        this.typeWithInputs("You jolt awake, your head spinning. What a wild dream that must have been. You can hardly even remember your own name... But of course, it is @ @!", "5.5em", "getname", InputService.firstlastNameValidate).then(this.getName.bind(this));
    }

    async getName(res) {
        const [p, inputs] = res;
        const [inputFirst, inputSecond] = inputs;
        inputs.forEach(i => {
            i.addEventListener("blur", (e) => {
                if (!e.relatedTarget?.closest("#story input, dialog")) i.focus({preventScroll: true});
            })
        });
        this.core.ui.center.classList.add("alphaactive");

        const finishGetName = async () => {
            this.core.city.setRulerName(inputFirst.value, inputSecond.value);
            this.core.clock.resume();
            this.core.ui.show("right", "news");
            this.core.news.update("You woke up from a strange dream.");
            let n = 0;

            await InputService.clearInput(p);
            TypingService.collapseP(p, i => `<span class='getname settled' style='display: inline-block; text-align: center; 
           width: ${p.querySelectorAll("input")[n++].getBoundingClientRect().width}px; 
           transition: width 0.2s;'>${i.firstChild.value}</span>`);

            document.querySelectorAll(".getname").forEach(el => {
                el.style.width = InputService.getTrueWidthName(this.core.ui.story, el.innerText) + "px";
                el.ontransitionend = () => (el.style.width = "min-content");
            });

            await delay(200);
            await this.getGender();
        };

        this.core.ui.story.append(InputService.getCue("Enter", () => finishGetName()));

        inputFirst.addEventListener("keydown", (e) => {
            if (e.key === " ") {
                e.preventDefault();
                inputSecond.focus({preventScroll: true});
            }
        });

        setTimeout(() => inputFirst.focus({preventScroll: true}), 0);
    }

    async getGender() {
        this.checkpoint(1);

        this.typeWithSpans("You roll out of bed, suddenly filled with anticipation. The past week has been a blur of funerals and ceremonies, but it has finally arrived: your first day on the job as the @ / @ of your city.", ["king", "queen"], ["kingChoice", "queenChoice"]).then(([p, spans]) => {
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
                this.core.city.ruler.gender = selected.innerText === "king" ? "M" : "F";

                InputService.clearInput(p, ".kingChoice, .queenChoice").then(() => {
                    setTimeout(() => {
                        TypingService.collapseP(p, i => i.classList.contains("selected") ? `<span class='settled' style='font-weight: 515; display: inline-block; 
                color: var(--accent)'>${i.innerText}</span>` : "");
                        this.getSpecialty();
                    }, 150);
                });
            };

            this.core.ui.story.append(InputService.getCue("Enter", () => finishGetGender()));
        });
    }

    async getSpecialty() {
        this.checkpoint(2);
        let res = await this.typeWithChoices(`As you throw on some suitably regal clothes, you find yourself wondering whether you will make a good ${this.core.city.genderSwitch("king", "queen")}. You do already know what your strong suit will be:`, ["leading the people to economic prosperity", "waging fierce military campaigns", "spearheading fortuitous new discoveries"]);
        this.recordChoice(res.i);
        await this.specialtyHint();
    }

    async specialtyHint() {
        this.checkpoint(3);
        let choice = this.getLastChoice();
        let chosenSpecialty;

        await this.choiceNote(...(() => {
            switch (choice) {
                case 0:
                    chosenSpecialty = "Savvy";
                    this.core.city.ruler.savvy = 10;
                    return ["+10 @", ["Savvy"], ["term"], ["savvy"]];
                case 1:
                    chosenSpecialty = "Valor";
                    this.core.city.ruler.valor = 10;
                    return ["+10 @", ["Valor"], ["term"], ["valor"]];
                case 2:
                    chosenSpecialty = "Wisdom";
                    this.core.city.ruler.wisdom = 10;
                    return ["+10 @", ["Wisdom"], ["term"], ["wisdom"]];
            }
        })());

        const box = createHintBox(this.core.ui.story, "Many things in the game can be hovered over or tapped to show a tooltip. Try it now on @! For more in-depth information, see the @.", [chosenSpecialty, "Codex"], ["term", "codexWord term"], [chosenSpecialty.toLowerCase()]);

        await delay(1000);

        this.core.ui.story.append(InputService.getCue("Enter", () => {
            box.destroy().then(() => this.getCityName());
        }, true));
    }

    async getCityName() {
        this.checkpoint(4);
        let name;
        this.typeWithInputs("You leave your bedroom and begin walking down the corridor, admiring through the windows the sweeping views of your hometown afforded by the castle's hilltop vantage point. It is a small but proud city (by the name of @), nestled between the forest and the sea.", "5.5em", "getname", InputService.nameValidate).then(res => {
            const [p, inputs] = res;
            name = inputs[0];
            name.addEventListener("blur", (e) => {
                if (!e.relatedTarget?.closest("#story input, dialog")) name.focus({preventScroll: true})
            });
            this.core.ui.center.classList.add("alphaactive");
            this.core.ui.story.append(InputService.getCue("Enter", () => this.finishGetCityName(p)));
            setTimeout(() => name.focus({preventScroll: true}), 0);
        });
    }

    async finishGetCityName(p) {
        const name = p.querySelector(".getname");
        this.core.city.name = name.value;
        InputService.clearInput(p).then(async () => {
            TypingService.collapseP(p, i => `<span class='getname settled' style='display: inline-block; text-align: center; 
           width: ${p.querySelector(".getname").getBoundingClientRect().width}px; 
           transition: width 0.2s;'>${i.firstChild.value}</span>`);
            let settledName = p.querySelector(".getname");
            settledName.style.width = InputService.getTrueWidthName(this.core.ui.story, settledName.innerText) + "px";
            settledName.ontransitionend = () => (settledName.style.width = "min-content");
            await delay(225);
            await this.beginUpheaval();
        });
    }

    async beginUpheaval() {
        this.checkpoint(5);
        await this.typeP(`Out of nowhere, the floor heaves, knocking you off your feat. Outside, the sky explodes into a kaleidoscope of surreal colors and the land beyond ${this.core.city.name} transforms. The events of your dream—or rather, your vision—rush back to you:`);
        await this.typeP("The long prophecied Cataclysm has arrived.", {italic: true});
        await this.typeP("The creator of the universe has perished, and his limitless power has been scattered across the cosmos, rewriting the laws of reality along the way.", {italic: true});
        await this.typeP("Some of that power has found its home in you.", {italic: true});

        await this.cueBegin();
    }

    async cueBegin() {
        this.checkpoint(6);
        this.core.ui.story.appendChild(InputService.getButton("Begin Game", "beginGame", async () => {
            await delay(200);
            this.core.industry.access.basic = true;
            document.querySelector("#industrynav").classList.remove("locked");
            this.core.ui.show("center", "industry");
            this.showProductionInfoBoxes();
        }));
    }

    showProductionInfoBoxes() {
        const tryShowTheurgy = () => {
            if (this.dismissedInfoBoxes.has('theurgy-plant')) return;
            const plantBtn = document.querySelector("#theurgy-plant");
            if (plantBtn) {
                this.showInfoBox('theurgy-plant', plantBtn, "As a trifle of your divine power, you can will resources into existence.");
            } else {
                setTimeout(tryShowTheurgy, 50);
            }
        };

        const tryShowFarmPlot = () => {
            if (this.dismissedInfoBoxes.has('farm-plot')) return;
            const mainBtn = document.querySelector('[data-building-type="farmPlot"].building-main-btn');
            if (mainBtn) {
                const message = this.getFarmPlotMessage();
                this.showInfoBox('farm-plot', mainBtn, message, { 
                    preferredPosition: 'below',
                    updateFn: () => `<p>${this.getFarmPlotMessage()}</p>`
                });
            } else {
                setTimeout(tryShowFarmPlot, 50);
            }
        };

        requestAnimationFrame(() => {
            tryShowTheurgy();
            tryShowFarmPlot();
        });
    }

    showInfoBox(id, element, message, options = {}) {
        if (this.dismissedInfoBoxes.has(id)) return;
        if (!element) return;
        if (document.querySelector(`[data-infobox-id="${id}"]`)) return;

        const box = createInfoBox(element, `<p>${message}</p>`, {
            id: id,
            preferredPosition: options.preferredPosition,
            updateFn: options.updateFn,
            createRenderInterval: this.core.ui.createRenderInterval.bind(this.core.ui),
            destroyRenderInterval: this.core.ui.destroyRenderInterval.bind(this.core.ui),
            onDismiss: () => {
                this.dismissedInfoBoxes.add(id);
                this.core.storage.saveFullGame(this.core);
            }
        });
    }

    dismissInfoBox(id) {
        const box = document.querySelector(`[data-infobox-id="${id}"]`);
        if (box && box._dismiss) {
            box._dismiss();
        }
    }

    getFarmPlotMessage() {
        const crops = this.core.industry.resources.crops.value.toNumber();
        const needed = 10 - crops;
        if (needed <= 0) {
            return "Build your first farm plot to passively gain crops every second";
        } else {
            return `Gather ${needed} more crop${needed > 1 ? 's' : ''} to be able to build your first farm plot. Farm plots passively gain crops every second.`;
        }
    }

    checkFarmPlotWorkerInfo() {
        if (this.dismissedInfoBoxes.has('farm-plot-worker')) return;
        if (document.querySelector(`[data-infobox-id="farm-plot-worker"]`)) return;
        
        const farmPlot = this.core.industry.buildings.farmPlot;
        if (farmPlot && farmPlot.count > 0) {
            const tryShowWorker = () => {
                const farmPlotRow = document.querySelector('[data-building-type="farmPlot"].building-main-btn')?.closest('.building-row');
                if (farmPlotRow) {
                    const workerBtn = farmPlotRow.querySelector('.building-worker-btn');
                    if (workerBtn && !this.dismissedInfoBoxes.has('farm-plot-worker') && !document.querySelector(`[data-infobox-id="farm-plot-worker"]`)) {
                        this.showInfoBox('farm-plot-worker', workerBtn, "This button assign workers to the farm to refine crops into food.");
                    }
                } else {
                    setTimeout(tryShowWorker, 100);
                }
            };
            setTimeout(tryShowWorker, 300);
        }
    }

    async runFrom(phase) {
        switch (phase) {
            case 0:
                await this.beginPrologue();
                break;
            case 1:
                await this.getGender();
                break;
            case 2:
                await this.getSpecialty();
                break;
            case 3:
                await this.specialtyHint();
                break;
            case 4:
                await this.getCityName();
                break;
            case 5:
                await this.beginUpheaval();
                break;
            case 6:
                await this.cueBegin();
                break;
        }
    }

    boot() {
        if (this.core.industry.access.basic && this.core.ui.activePanels["center"] === "industry") {
            requestAnimationFrame(() => {
                this.showProductionInfoBoxes();
                this.checkFarmPlotWorkerInfo();
            });
        }
    }

    updateRunning() {
        if (this.core.ui.activePanels["center"] !== "story") {
            this.#running = false;
            return;
        }
        if (this.#running) return;
        this.#running = true;

        const phase = this.progress ?? 0;
        this.core.ui.panels.story.reset(this.snapshots);
        this.runFrom(phase);
    }

    serialize() {
        const {core, ...rest} = this;
        return {
            ...rest,
            dismissedInfoBoxes: Array.from(this.dismissedInfoBoxes)
        };
    }

    deserialize(data) {
        Object.assign(this, data);
        if (data.dismissedInfoBoxes) {
            this.dismissedInfoBoxes = new Set(data.dismissedInfoBoxes);
        } else {
            this.dismissedInfoBoxes = new Set();
        }
    }
} 