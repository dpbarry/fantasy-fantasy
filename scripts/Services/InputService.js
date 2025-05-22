export default class InputService {
    static isAlphabetic(text) {
        return [...text].every(c => "abcdefghijklmnopqrstuvwxyz".includes(c.toLowerCase()))
    }

    /**
     * @param {string} id
     * @param {function} cb
     * @param {string} type
     * @param {string} className
     * @returns {HTMLInputElement}
     */
    static getInput(id, cb, type = "alpha", className = "") {
        const input = document.createElement("input");
        input.id = id;
        input.className = className;
        input.autocomplete = "off";
        input.inputMode = "none";
        input.whitespace = "nowrap";
        input.spellcheck = false;
        input.oninput = cb;
        input.onfocus = () => {
            cb({data: "", target: input});
            document.body.classList.add(type + "active");
            window.dispatchEvent(new Event("resize"));

            // Simulate key pushes
            const keydownHandler = (e) => {
                const key = e.key.toLowerCase();
                // Find the corresponding virtual key
                const virtualKey = [...document.querySelectorAll(".key:not(.nudged)")].find(k => k.innerText.toLowerCase() === key);
                if (virtualKey) {
                    virtualKey.classList.add("nudged");
                    virtualKey.classList.add("forceactive");
                    // Remove the nudged class after animation
                    setTimeout(() => {
                        virtualKey.classList.remove("nudged");
                        virtualKey.classList.remove("forceactive");
                    }, 100);
                }
            };

            document.addEventListener("keydown", keydownHandler);

            // Clean up event listener when focus is lost
            input.onblur = (e) => {
                if (!e.relatedTarget?.closest("input, dialog")) {
                    e.target.focus();
                }
            };
        };


        input.onanimationend = () => input.classList.remove("invalid");
        return input;
    }

    /**
     * @param {string} key
     * @param {function} cb
     * @param {boolean} immediatelyVisible
     * @returns {HTMLSpanElement}
     */
    static getCue(key, cb, immediatelyVisible = false) {
        const cue = document.createElement("span");
        cue.className = `cue ${key.toLowerCase()}`;
        cue.addEventListener("pointerdown", () => cue.classList.add("nudged"));

        function cueReceived() {
            document.removeEventListener("keydown", wrapKeydown);
            cue.removeEventListener("click", cueReceived);
            cue.classList.add("done");

            setTimeout(() => {
                cue.remove();
                cb();
            }, 200);
        }

        const wrapKeydown = (e) => {
            if (e.key === key && window.getComputedStyle(cue).getPropertyValue("opacity") !== "0") {
                cueReceived();
            }
        };

        document.addEventListener("keydown", wrapKeydown);
        cue.addEventListener("pointerdown", cueReceived);
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
            i.classList.add("settled");
            i.style.transitionDuration = "";
            if (i.closest(".inputwrap")) i.parentNode.style.transitionDuration = "";
        });
        document.body.classList.remove("alphaactive");
        document.body.classList.remove("numactive");
        document.body.classList.remove("alphanumactive");

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
            if (e.target.parentNode.nextElementSibling.nextElementSibling?.firstChild?.value?.length || e.target.parentNode.previousSibling.previousSibling.firstChild?.value?.length) {
                e.target.closest("#story").querySelector(".cue").classList.add("visible");
            } else {
                e.target.closest("#story").querySelector(".cue").classList.remove("visible");
            }
        })
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

        const updateKeyboardCase = (isEmpty) => {
            const keys = document.querySelectorAll("#alphaboard .key:not(.special-key)");
            keys.forEach(key => {
                if (key.classList.contains("action")) return;
                key.innerText = isEmpty ? key.innerText.toUpperCase() : key.innerText.toLowerCase();
            });
        };

        if (!e.data) {
            if (!e.target.value) {
                resetField(e.target);
                updateKeyboardCase(true); // Show uppercase when empty
                return;
            }
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
            updateKeyboardCase(false); // Show lowercase when there's content

            e.target.selectionStart = store;
            e.target.selectionEnd = store;
            let width = InputService.getTrueWidthName(e.target.closest("#story"), e.target.value) / 15 + "em";
            e.target.style.width = width;
            e.target.parentNode.style.width = width;

            setTimeout(() => {
                e.target.style.transitionDuration = "0s";
                e.target.parentNode.style.transitionDuration = "0s";
            }, 100);

            if (cueCheck) {
                cueCheck(e.target);
            } else {
                e.target.closest("#story").querySelector(".cue").classList.add("visible");
            }

        } else {
            resetField(e.target);
            updateKeyboardCase(true); // Show uppercase when empty
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
        p.style.fontSize = "0.9em";

        pStory.append(p);
        p.innerText = text;

        let rect = p.getBoundingClientRect();
        let store = rect.width;
        p.remove();
        return store;
    }
}