export default class InputService {
    static #center = document.getElementById("center");

    static #resizeHandlers = [];

    static {
        window.addEventListener("resize", () => {
            this.#resizeHandlers.forEach(cb => cb());
        })
    }

    static isAlphabetic(text) {
        return [...text].every(c => "abcdefghijklmnopqrstuvwxyz".includes(c.toLowerCase()))
    }

    /**
     * @param {function} cb
     * @param {string} type
     * @param {string} className
     * @returns {HTMLInputElement}
     */
    static getInput(cb, type = "alpha", className = "") {
        const input = document.createElement("input");
        input.name = "inp";
        input.className = className;
        input.inputMode = type === "alpha" ? "none" : "numeric";
        input.oninput = cb;

        input._resizeHandle = () => cb({data: "", target: input});
        this.#resizeHandlers.push(input._resizeHandle);

        input.onfocus = () => cb({data: "", target: input});


        input.onanimationend = () => input.classList.remove("invalid");
        return input;
    }

    /**
     * @param {string} key
     * @param {function} cb
     * @param {boolean} immediatelyVisible
     * @param {string} text
     * @returns {HTMLSpanElement}
     */
    static getCue(key, cb, immediatelyVisible = false, text = "") {
        const cue = document.createElement("span");
        cue.innerText = text;
        cue.className = `cue ${key.toLowerCase()} nudge`;

        function cueReceived() {
            document.removeEventListener("keydown", wrapKeydown);
            if (!cue) return;
            cue.removeEventListener("click", cueReceived);
            cue.classList.add("done");

            setTimeout(() => {
                let parent = cue.parentElement;
                if (parent._scrollObserver) {
                    parent._scrollObserver.disconnect();
                    const addedHeight = cue.getBoundingClientRect().height;
                    const currentPad = parseFloat(getComputedStyle(parent).paddingBottom) || 0;
                    parent.style.paddingBottom = `${currentPad + addedHeight}px`;
                    parent._excessPadding += addedHeight;
                    cue.remove();
                    parent._scrollObserver.observe(parent, {
                        childList: true, subtree: true, characterData: true
                    });
                } else {
                    cue.remove();
                }
                cb();
            }, 200);
        }

        const wrapKeydown = (e) => {
            if (e.key === key && window.getComputedStyle(cue).getPropertyValue("opacity") !== "0") {
                cueReceived();
            }
        };

        document.addEventListener("keydown", wrapKeydown);
        cue.addEventListener("click", cueReceived);
        if (immediatelyVisible) cue.classList.add("fadeincue");
        return cue;
    };

    /**
     * @param {HTMLElement} p
     * @param {string} query
     */
    static async clearInput(p, query = ".inputwrap input") {
        p.querySelectorAll(query).forEach(i => {
            i.onblur = null;
            i.onfocus = null;
            // Remove focus recapture handlers if they exist
            if (i.blurHandler) {
                const blurHandler = i.blurHandler;
                i.removeEventListener("blur", blurHandler);
                delete i.blurHandler;
            }
            i.classList.add("settled");
            i.style.transitionDuration = "";
            if (i.closest(".inputwrap")) i.parentNode.style.transitionDuration = "";
            this.#resizeHandlers = this.#resizeHandlers.filter(h => h !== i._resizeHandle);

        });


        return new Promise(resolve => {
            const wrap = (e) => {
                e.target.removeEventListener("transitionend", wrap);
                resolve(p);
            }
            p.querySelector(query).addEventListener("transitionend", wrap);
        });
    };

    static firstlastNameValidate(e) {
        return InputService.nameValidate(e, () => {
            let firstInputLength = e.target.parentNode.nextElementSibling.nextElementSibling?.firstChild?.value?.length;
            let secondInputLength = e.target.parentNode.previousSibling.previousSibling.firstChild?.value?.length;
            if (firstInputLength && firstInputLength < 15 && e.target.value.length < 15) {
                e.target.closest("#story").querySelector(".cue").classList.add("visible");
            } else if (secondInputLength && secondInputLength < 15 && e.target.value.length < 15) {
                e.target.closest("#story").querySelector(".cue").classList.add("visible");
            } else {
                e.target.closest("#story").querySelector(".cue").classList.remove("visible");
            }
        });
    }

    /**
     * @param {InputEvent} e
     * @param {function} cueCheck
     */
    static nameValidate(e, cueCheck = null) {
        if (!e.target.closest("#story").querySelector(".cue")) return;

        const resetField = (target) => {
            target.classList.remove("full");
            target.style.transitionDuration = "";
            target.parentNode.style.transitionDuration = "";
            target.style.width = "";
            target.parentNode.style.width = target.parentNode._width;
            target.closest("#story").querySelector(".cue").classList.remove("visible");
        }


        if (!e.data && !e.target.value) {
                resetField(e.target);
                return;
        } else if (!InputService.isAlphabetic(e.data)) {
            let store = e.target.selectionStart - [...e.data].filter(c => !InputService.isAlphabetic(c)).length;
            const inputValue = e.target.value;
            e.target.value = inputValue.replace(/[^a-zA-Z]/g, '');

            e.target.classList.add("invalid");

            e.target.selectionStart = store;
            e.target.selectionEnd = store;
        }

        if (e.target.value.length >= 15) e.target.classList.add("full"); else e.target.classList.remove("full");

        if (e.target.value.length) {
            let store = e.target.selectionStart;

            e.target.value = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1).toLowerCase();

            e.target.selectionStart = store;
            e.target.selectionEnd = store;
            let width = InputService.getTrueWidthName(e.target.closest("#story"), e.target.value) + 4 + "px";
            e.target.style.width = width;
            e.target.parentNode.style.width = width;

            setTimeout(() => {
                e.target.style.transitionDuration = "0s";
                e.target.parentNode.style.transitionDuration = "0s";
            }, 100);

            if (cueCheck) {
                cueCheck(e.target);
            } else {
                let cue = e.target.closest("#story").querySelector(".cue");
                if (!cue) return;
                if (e.target.value.length < 15) cue.classList.add("visible"); else cue.classList.remove("visible");
            }

        } else {
            resetField(e.target);
        }
    }


    /**
     * @param {HTMLDivElement} pStory
     * @param {string} text
     * @returns {number}
     */
    static getTrueWidthName(pStory, text) {
        let p = document.createElement("p");
        p.className = "fakeinput getname";
        p.style.color = "transparent";
        p.style.pointerEvents = "none";
        p.style.userSelect = "none";

        pStory.append(p);
        p.innerText = text;

        let rect = p.getBoundingClientRect();
        let store = rect.width;
        p.remove();
        return store;
    }
    
    

    /**
     * Sets up focus recapture for input elements, returning a cleanup function
     * @param {HTMLInputElement[]} inputs
     * @returns {function} cleanup function
     */
    static setupFocusRecapture(inputs) {
        let blurEnabled = true;

        const blurHandler = (e) => {
            if (!blurEnabled) return;
            // Don't refocus if we're moving to a dialog or staying within story inputs
            if (e.srcElement?.closest("dialog") || e.relatedTarget?.closest("#story input") || (e.relatedTarget?.closest(".main-section") && !e.relatedTarget.closest(".main-section").classList.contains("active"))) {
               return;
            }
            // Refocus if focus is lost to something outside the story area
            if (!e.relatedTarget || !e.relatedTarget.closest("#story")) {
                e.currentTarget.focus({preventScroll: true});
            }
        };

        inputs.forEach(input => {
            input.addEventListener("blur", blurHandler);
            // Store cleanup info on the input for clearInput to use
            input.blurHandler = blurHandler;
        });

        // Return cleanup function
        return () => {
            inputs.forEach(input => {
                input.removeEventListener("blur", blurHandler);
                delete input.blurHandler;
            });
        };
    }

    static getButton(text, id, cb, className="ripples nudge") {
        const b = document.createElement("button");
        b.textContent = text;
        b.id = id;
        b.className = className;
        b.onclick = cb;

        return b;
    }
}