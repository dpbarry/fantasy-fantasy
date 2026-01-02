import InputService from "../../Services/InputService.js";
import { waitForEvent } from "../../Utils.js";
import createModalDialog from "../Components/Dialog.js";
import createSelect from "../Components/Select.js";

export default class StoryPanel {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("story");
        this.skipBanner = document.getElementById("skip-banner");
        this.isSubmitting = false;
        this.dialogSelects = {};

        this.setupAutoScroll();
        this.root._excessPadding = 0;

        this.skipDialog = this.createSkipDialog();

        this.skipBanner.addEventListener('click', () => {
            this.openSkipDialog();
        });
    }

    openSkipDialog() {
        if (this.currentDialogClose) return;

        const closeDialog = this.skipDialog.open();
        this.currentDialogClose = closeDialog;

        const dialog = document.getElementById('skip-dialog');
        const form = document.getElementById('skip-form');
        const submitBtn = document.getElementById('skip-submit');
        const randomizeBtn = document.getElementById('skip-randomize');
        const devsaveBtn = document.getElementById('skip-devsave');

        const updateSpecialtyEffect = (value) => {
            const specialtyEffect = document.getElementById('specialty-effect');
            const specialtyIndex = parseInt(value);
            if (specialtyIndex === 0) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="savvy">Savvy</span>';
            } else if (specialtyIndex === 1) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="valor">Valor</span>';
            } else if (specialtyIndex === 2) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="wisdom">Wisdom</span>';
            } else {
                specialtyEffect.innerHTML = '&nbsp;';
            }
        };

        this.dialogSelects.gender = createSelect({
            options: [
                { value: 'M', label: 'King' },
                { value: 'F', label: 'Queen' }
            ],
        });
        document.getElementById('gender-container').appendChild(this.dialogSelects.gender.element);

        this.dialogSelects.specialty = createSelect({
            options: [
                { value: '0', label: 'Economic Prosperity' },
                { value: '1', label: 'Military Campaigns' },
                { value: '2', label: 'New Discoveries' }
            ],
            onChange: (value) => updateSpecialtyEffect(value)
        });
        document.getElementById('specialty-container').appendChild(this.dialogSelects.specialty.element);

        const validateForm = () => {
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const cityName = document.getElementById('city-name').value.trim();
            const gender = this.dialogSelects.gender.value;
            const specialty = this.dialogSelects.specialty.value;

            const isValid = firstName && lastName && cityName && gender && specialty &&
                firstName.length <= 15 && lastName.length <= 15 && cityName.length <= 15 &&
                InputService.isAlphabetic(firstName) && InputService.isAlphabetic(lastName) && InputService.isAlphabetic(cityName);

            submitBtn.disabled = !isValid;
            return isValid;
        };

        const listeners = [];

        ['first-name', 'last-name', 'city-name'].forEach(id => {
            const input = document.getElementById(id);
            input.onanimationend = () => input.classList.remove("invalid");

            const inputHandler = (e) => {
                if (!e.data) return;

                if (!InputService.isAlphabetic(e.data)) {
                    const inputValue = e.target.value;
                    e.target.value = inputValue.replace(/[^a-zA-Z]/g, '');
                    e.target.classList.add("invalid");
                }

                if (e.target.value.length >= 15) {
                    e.target.classList.add("full");
                } else {
                    e.target.classList.remove("full");
                }

                if (e.target.value.length) {
                    e.target.value = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();
                }
            };

            const validateHandler = () => validateForm();

            input.addEventListener('input', inputHandler);
            input.addEventListener('input', validateHandler);

            listeners.push(() => {
                input.removeEventListener('input', inputHandler);
                input.removeEventListener('input', validateHandler);
            });
        });

        const genderEl = this.dialogSelects.gender.element;
        const specialtyEl = this.dialogSelects.specialty.element;
        const selectClickHandler = () => setTimeout(validateForm, 10);
        genderEl.addEventListener('click', selectClickHandler);
        specialtyEl.addEventListener('click', selectClickHandler);
        listeners.push(() => {
            genderEl.removeEventListener('click', selectClickHandler);
            specialtyEl.removeEventListener('click', selectClickHandler);
        });

        const randomizeHandler = () => {
            this.randomizeInputs();
            validateForm();
        };

        randomizeBtn.addEventListener('click', randomizeHandler);
        listeners.push(() => randomizeBtn.removeEventListener('click', randomizeHandler));

        const devsaveHandler = async () => {
            closeDialog();
            await waitForEvent(document, 'dialogResolved');

            await this.core.storage.storeSave(this.core.storage.devSave);
            await this.core.storage.loadFullGame(this.core);
            requestAnimationFrame(() => {
                this.core.story.startGame();
                window.location.reload();
            });
        };

        devsaveBtn.addEventListener('click', devsaveHandler);
        listeners.push(() => devsaveBtn.removeEventListener('click', devsaveHandler));

        const submitHandler = async (e) => {
            e.preventDefault();
            if (!validateForm() || this.isSubmitting) return;

            this.isSubmitting = true;

            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const cityName = document.getElementById('city-name').value.trim();
            const gender = this.dialogSelects.gender.value;
            const specialty = this.dialogSelects.specialty.value;

            this.core.city.setRulerName(firstName, lastName);
            this.core.city.ruler.gender = gender;
            this.core.city.name = cityName;

            const specialtyIndex = parseInt(specialty);
            if (specialtyIndex === 0) this.core.city.ruler.savvy = 10;
            else if (specialtyIndex === 1) this.core.city.ruler.valor = 10;
            else if (specialtyIndex === 2) this.core.city.ruler.wisdom = 10;

            this.core.story.recordChoice(specialtyIndex);
            this.core.story.checkpoint(6);

            closeDialog();

            await waitForEvent(document, 'dialogResolved');

            requestAnimationFrame(() => {
                this.core.story.startGame(true);
                this.isSubmitting = false;
            });
        };

        form.addEventListener('submit', submitHandler);
        listeners.push(() => form.removeEventListener('submit', submitHandler));

        const cleanup = () => {
            listeners.forEach(cleanup => cleanup());
            if (this.dialogSelects.gender) {
                this.dialogSelects.gender.destroy();
                this.dialogSelects.gender = null;
            }
            if (this.dialogSelects.specialty) {
                this.dialogSelects.specialty.destroy();
                this.dialogSelects.specialty = null;
            }
            this.currentDialogClose = null;
        };

        const originalOnClose = dialog.onclose;
        dialog.onclose = () => {
            cleanup();
            if (originalOnClose) originalOnClose();
        };

        validateForm();
    }

    createSkipDialog() {
        const dialogHTML = `
            <dialog id="skip-dialog">
            <p class='caption'>The creator of reality has permanently retired, and you were deemed worthy of a promotion.</p>
                <form id="skip-form" novalidate>
                    <div class="input-row">
                        <div class="input-group">
                            <label for="first-name">First Name</label>
                            <input id="first-name" name="first" type="text" maxlength="15" required>
                        </div>
                        <div class="input-group">
                            <label for="last-name">Last Name</label>
                            <input id="last-name" name="last" type="text" maxlength="15" required>
                        </div>
                        <div class="input-group">
                            <label>Gender</label>
                            <div id="gender-container"></div>
                        </div>
                    </div>
                    <div class="input-row">
                        <div class="input-group">
                            <label for="city-name">City Name</label>
                            <input id="city-name" name="city" type="text" maxlength="15" required>
                        </div>
                        <div class="input-group">
                            <label>Specialty</label>
                            <div id="specialty-container"></div>
                            <small id="specialty-effect" class="specialty-effect">&nbsp;</small>
                        </div>
                    </div>
                    <div class="button-row">
                        <button type="submit" id="skip-submit">Begin Game</button>
                        <button type="button" id="skip-randomize">Randomize</button>
                        <button type="button" id="skip-devsave">Dev Save</button>
                    </div>
                </form>
            </dialog>
        `;

        return createModalDialog(dialogHTML);
    }

    reset(html) {
        this.root.innerHTML = html;
        this.root.scrollBy({ top: this.root.scrollHeight });
        this.skipBanner.style.display = this.core.story.progress === 0 ? 'flex' : "none";
    }

    setupAutoScroll() {
        const scrollNow = () => {
            const last = this.root.lastElementChild;
            if (!last) return;
            const rectC = this.root.getBoundingClientRect();
            const rectL = last.getBoundingClientRect();
            if (rectL.bottom > rectC.bottom - 45) {
                this.root.scrollTo({ top: this.root.scrollHeight - this.root._excessPadding, behavior: "smooth" });
                this.root.style.paddingBottom = "";
                this.root._excessPadding = 0;
            }
        };

        let scrollObserver = new MutationObserver(scrollNow);
        this.root._scrollObserver = scrollObserver;
        scrollObserver.observe(this.root, {
            childList: true, subtree: true
        });
        window.addEventListener("resize", () => {
            scrollNow();
        });
    }

    updateVisibility(loc, panel) {
        this.core.story.updateRunning();
        if (loc === "center") {
            if (panel === "story")
                this.root.closest(".box").classList.add("shown");
            else
                this.root.closest(".box").classList.remove("shown");
        }

    }

    randomizeInputs() {
        const gender = Math.random() < 0.5 ? 'M' : 'F';
        if (this.dialogSelects.gender) this.dialogSelects.gender.setValue(gender);

        const maleFirstNames = ["Laric", "Tirias", "Emyl", "Kastar"];
        const femaleFirstNames = ["Iniria", "Zasha", "Rennye", "Marrion"];
        const lastNames = ["Strong", "Mith", "Doran", "Amas"];
        const cityNames = ["Vauria", "Edren", "Forjas", "Ochom"];

        const firstNameArray = gender === 'M' ? maleFirstNames : femaleFirstNames;
        if (firstNameArray.length > 0) document.getElementById('first-name').value = firstNameArray[Math.floor(Math.random() * firstNameArray.length)];
        if (lastNames.length > 0) document.getElementById('last-name').value = lastNames[Math.floor(Math.random() * lastNames.length)];

        const specialtyValue = Math.floor(Math.random() * 3).toString();
        if (this.dialogSelects.specialty) this.dialogSelects.specialty.setValue(specialtyValue);

        const specialtyEffect = document.getElementById('specialty-effect');
        if (specialtyValue === '0') {
            specialtyEffect.innerHTML = '+10 <span class="term" data-tips="savvy">Savvy</span>';
        } else if (specialtyValue === '1') {
            specialtyEffect.innerHTML = '+10 <span class="term" data-tips="valor">Valor</span>';
        } else if (specialtyValue === '2') {
            specialtyEffect.innerHTML = '+10 <span class="term" data-tips="wisdom">Wisdom</span>';
        }

        document.getElementById('city-name').value = cityNames[Math.floor(Math.random() * cityNames.length)];
    }
}
