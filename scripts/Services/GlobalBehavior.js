import HackService from "./HackService.js";

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;

    const normalizeInputsAndForms = (root = document) => {
        root.querySelectorAll?.('input').forEach((input) => {
            input.autocomplete = "off";
            input.spellcheck = false;
        });
        root.querySelectorAll?.('form').forEach((form) => {
            form.setAttribute('novalidate', '');
        });
    };

    normalizeInputsAndForms(document);

    const inputObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.tagName === 'INPUT') {
                    node.autocomplete = "off";
                    node.spellcheck = false;
                }
                if (node.tagName === 'FORM') {
                    node.setAttribute('novalidate', '');
                }
                normalizeInputsAndForms(node);
            });
        });
    });

    inputObserver.observe(document.body, { childList: true, subtree: true });

    const settingsButton = document.querySelector("#settingsnav");
    if (settingsButton) {
        settingsButton.addEventListener("click", async () => {
            if (++settingsClicks >= 5) {
                await HackService.show(core);
                settingsClicks = 0;
            }
        });
    }

    document.querySelectorAll("[data-loc][data-panel]").forEach((button) => {
        button.onpointerdown = () => {
            if (button.classList.contains("locked")) return;
            core.ui.show(button.dataset.loc, button.dataset.panel);
        };
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const target = document.activeElement;
        if (!target) return;

        const interactiveSelectors = [
            'button',
            'input[type="button"]',
            'input[type="submit"]',
            'input[type="reset"]',
            'input[type="image"]',
            '[role="button"]',
            '[role="menuitem"]',
            '[role="option"]',
            '[role="tab"]',
            '.navbutton',
            '.ripples'
        ];

        const isInteractive = interactiveSelectors.some((selector) => target.matches(selector))
            || target.onclick !== null
            || target.onpointerdown !== null
            || target.getAttribute('onclick') !== null;

        if (target.tagName === 'INPUT' && !['button', 'submit', 'reset', 'image'].includes(target.type)) return;
        if (target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return;

        if (isInteractive) {
            e.preventDefault();
            target.click();
            target.dispatchEvent(new Event('pointerdown', { simulated: true }));
            target.dispatchEvent(new Event('pointerup'));
        }
    });
}

export function applyTheme(core) {
    window.applyTheme(core.settings.configs.background, core.settings.configs.accent);
}

export function spawnRipple(mouseEvent, element) {
    if (element.disabled) return;
    document.querySelectorAll(".ripple").forEach(el => el.remove());

    const rippleEl = document.createElement('div');
    rippleEl.classList.add('ripple');

    let x = element.offsetWidth / (Math.floor(Math.random() * 5) + 1);
    let y = element.offsetHeight / (Math.floor(Math.random() * 5) + 1);

    if (!mouseEvent.simulated) {
        x = mouseEvent.offsetX;
        y = mouseEvent.offsetY;
    }

    rippleEl.style.left = `${x}px`;
    rippleEl.style.top = `${y}px`;
    element.appendChild(rippleEl);

    requestAnimationFrame(() => rippleEl.classList.add('run'));

    const cleanup = setTimeout(() => rippleEl.remove(), 750);
    rippleEl.addEventListener('transitionend', () => { clearTimeout(cleanup); rippleEl.remove(); });
    return rippleEl;
}
