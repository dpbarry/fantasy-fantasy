import InputService from "../../Services/InputService.js";
import { waitForEvent } from "../../Utils.js";
import createModalDialog from "../Components/Dialog.js";

export default class StoryPanel {
    constructor(core) {
        this.core = core;
        this.root = document.getElementById("story");
        this.skipBanner = document.getElementById("skip-banner");
        this.isSubmitting = false;

        // auto-scroll on new content
        this.setupAutoScroll();
        this.root._excessPadding = 0;

        // Create skip dialog
        this.skipDialog = this.createSkipDialog();

        // skip prologue handler
        this.skipBanner.addEventListener('click', () => {
            this.openSkipDialog();
        });
    }


    openSkipDialog() {
        // Prevent multiple dialogs from being opened
        if (this.currentDialogClose) return;

        // Access the DOM elements first
        const dialog = document.getElementById('skip-dialog');
        const form = document.getElementById('skip-form');
        const submitBtn = document.getElementById('skip-submit');
        const randomizeBtn = document.getElementById('skip-randomize');
        const devsaveBtn = document.getElementById('skip-devsave');

        // Validation
        const validateForm = () => {
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();
            const cityName = document.getElementById('city-name').value.trim();

            const isValid = firstName && lastName && cityName &&
                           firstName.length <= 15 && lastName.length <= 15 && cityName.length <= 15 &&
                           InputService.isAlphabetic(firstName) && InputService.isAlphabetic(lastName) && InputService.isAlphabetic(cityName);

            submitBtn.disabled = !isValid;
            return isValid;
        };

        // Store listener functions for cleanup
        const listeners = [];

        // Simple validation using InputService.isAlphabetic like in StoryManager
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

        // Specialty change handler
        const specialtyHandler = (e) => {
            const specialtyEffect = document.getElementById('specialty-effect');
            const specialtyIndex = parseInt(e.target.value);

            // Update the tooltip and text based on selected specialty
            if (specialtyIndex === 0) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="savvy">Savvy</span>';
            } else if (specialtyIndex === 1) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="valor">Valor</span>';
            } else if (specialtyIndex === 2) {
                specialtyEffect.innerHTML = '+10 <span class="term" data-tips="wisdom">Wisdom</span>';
            }
        };

        document.getElementById('specialty').addEventListener('change', specialtyHandler);
        listeners.push(() => document.getElementById('specialty').removeEventListener('change', specialtyHandler));

        // Randomize button
        const randomizeHandler = () => {
            this.randomizeInputs();
            validateForm();
        };

        randomizeBtn.addEventListener('click', randomizeHandler);
        listeners.push(() => randomizeBtn.removeEventListener('click', randomizeHandler));

        // Dev save button
        const devsaveHandler = async () => {
            closeDialog();
            await waitForEvent(document, 'dialogResolved');

            await this.core.storage.storeSave(this.core.storage.devSave);
            await this.core.storage.loadFullGame(this.core);
            // Exact same flow as prologue button click
            requestAnimationFrame(() => {
                this.core.story.startGame(); 
                // skip news setup since save state already has it
                window.location.reload();
            });
        };

        devsaveBtn.addEventListener('click', devsaveHandler);
        listeners.push(() => devsaveBtn.removeEventListener('click', devsaveHandler));

        // Form submission
        const submitHandler = async (e) => {
            e.preventDefault();
            if (!validateForm() || this.isSubmitting) return;

            this.isSubmitting = true;

            const formData = new FormData(form);
            const data = Object.fromEntries(formData);

            // Set game state like prologue completion
            this.core.city.setRulerName(data.first, data.last);
            this.core.city.ruler.gender = data.gender;
            this.core.city.name = data.city;

            // Set specialty
            const specialtyIndex = parseInt(data.specialty);
            if (specialtyIndex === 0) this.core.city.ruler.savvy = 10;
            else if (specialtyIndex === 1) this.core.city.ruler.valor = 10;
            else if (specialtyIndex === 2) this.core.city.ruler.wisdom = 10;

            this.core.story.recordChoice(specialtyIndex);
            this.core.story.checkpoint(6); // Mark story as completed like prologue

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
            this.currentDialogClose = null;
        };

        // Open dialog and set up cleanup on close
        const closeDialog = this.skipDialog.open();
        this.currentDialogClose = closeDialog;

        // Set up cleanup when dialog closes
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
            <p class='caption'>The creator of the multiverse has permanently retired. Your divinely ordained task: safeguard your world’s future.</p>
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
                            <label for="gender">Gender</label>
                            <select id="gender" name="gender" required>
                                <option value="Test" selected disabled hidden></option>
                                <option value="M">King</option>
                                <option value="F">Queen</option>
                            </select>
                        </div>
                    </div>
                    <div class="input-row">
                        <div class="input-group">
                            <label for="city-name">City Name</label>
                            <input id="city-name" name="city" type="text" maxlength="15" required>
                        </div>
                        <div class="input-group">
                            <label for="specialty">Specialty</label>
                            <select id="specialty" name="specialty" required>
                                <option value="" selected disabled hidden></option>
                                <option value="0">Economic Prosperity</option>
                                <option value="1">Military Campaigns</option>
                                <option value="2">New Discoveries</option>
                            </select>
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
        this.root.scrollBy({top: this.root.scrollHeight});
        // Show skip banner when story is reset (new game)
        this.skipBanner.style.display = this.core.story.progress == 0 ? 'flex' : "none";
    }

    setupAutoScroll() {
        const scrollNow = () => {
            const last = this.root.lastElementChild;
            if (!last) return;
            const rectC = this.root.getBoundingClientRect();
            const rectL = last.getBoundingClientRect();
            if (rectL.bottom > rectC.bottom - 45) {
                this.root.scrollTo({top: this.root.scrollHeight - this.root._excessPadding, behavior: "smooth"});
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
        // Randomize gender first
        const gender = Math.random() < 0.5 ? 'M' : 'F';
        document.getElementById('gender').value = gender;

        // Gender-specific name arrays (populate with your own names)
        const maleFirstNames = [];
        const femaleFirstNames = [];
        const lastNames = [];

        const cityNames = [];

        // Select first name based on gender
        const firstNameArray = gender === 'M' ? maleFirstNames : femaleFirstNames;
        if (firstNameArray.length > 0) {
            document.getElementById('first-name').value = firstNameArray[Math.floor(Math.random() * firstNameArray.length)];
        }

        // Select last name (gender-neutral)
        if (lastNames.length > 0) {
            document.getElementById('last-name').value = lastNames[Math.floor(Math.random() * lastNames.length)];
        }

        const specialtyValue = Math.floor(Math.random() * 3).toString();
        document.getElementById('specialty').value = specialtyValue;

        // Update specialty effect based on randomized value
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
