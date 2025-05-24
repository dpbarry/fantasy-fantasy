export default function setupKeyboard() {
    document.querySelectorAll(".key").forEach(k => {
        k.tabIndex = 0;
        k.addEventListener("pointerdown", () => k.classList.add("nudged"));
        k.onpointerdown = () => {
            k.focus();

            setTimeout(() => {
                let input = document.activeElement;
                switch (k.innerText) {
                    case "⏎":
                        input.dispatchEvent(new KeyboardEvent('keydown', {
                            code: 'Enter', key: 'Enter', charCode: 13, keyCode: 13, view: window, bubbles: true
                        }));
                        break;
                    case "SPC":
                        input.dispatchEvent(new KeyboardEvent('keydown', {
                            code: 'Space', key: ' ', charCode: 32, keyCode: 32, view: window, bubbles: true
                        }));
                        break;
                    case "⟵":
                        input.value = input.value.slice(0, -1);
                        input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                        break;
                    default:
                        input.value = input.value + k.innerText;
                        input.dispatchEvent(new Event('input', {bubbles: true, cancelable: true}));
                }


            }, 0);
        };
    });
}