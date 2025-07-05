import HackService from "./HackService.js";

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;
    let isMobile = window.matchMedia("(width <= 950px)").matches;

    const settingsButton = document.querySelector("#settingsnav");
    if (!settingsButton) return;

    settingsButton.addEventListener("click", () => {
        if (++settingsClicks >= 5) {
            HackService.show(core);
            settingsClicks = 0;
        }
    });

    const sectionsWrapper = document.querySelector("#sections-wrapper");
    const sectionMap = {
        "left": 0,
        "center": 1,
        "right": 2
    };

    function scrollToVisibleSection() {
        if (!isMobile || !sectionsWrapper) return;
        
        const sectionIndex = sectionMap[core.ui.visibleSection];
        if (sectionIndex !== undefined) {
            const sections = sectionsWrapper.querySelectorAll("section");
            if (sections[sectionIndex]) {
                sectionsWrapper.scrollTo({
                    left: sections[sectionIndex].offsetLeft,
                    behavior: "auto"
                });
            }
        }
    }

    function updateVisibleSectionFromScroll() {
        if (!isMobile || !sectionsWrapper) return;
        
        const sections = sectionsWrapper.querySelectorAll("section");
        const scrollLeft = sectionsWrapper.scrollLeft;
        const wrapperWidth = sectionsWrapper.offsetWidth;
        
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            const sectionLeft = section.offsetLeft;
            const sectionRight = sectionLeft + section.offsetWidth;
            
            if (scrollLeft >= sectionLeft - wrapperWidth / 2 && scrollLeft < sectionRight - wrapperWidth / 2) {
                const sectionNames = ["left", "center", "right"];
                core.ui.visibleSection = sectionNames[i];
                break;
            }
        }
    }

    const navbuttons = document.querySelectorAll(".navbutton");
    navbuttons.forEach(b => {
        b.onpointerdown = () => {
            if (b.classList.contains("locked")) return;
            core.ui.show(b.dataset.loc, b.dataset.panel);
        }
    });

    const resizeHandler = () => {
        isMobile = window.matchMedia("(width <= 950px)").matches;
        scrollToVisibleSection();
    };

    const scrollHandler = () => {
        updateVisibleSectionFromScroll();
    };

    window.addEventListener("resize", resizeHandler);
    sectionsWrapper.addEventListener("scroll", scrollHandler);

    scrollToVisibleSection();
}

export function applyTheme(core) {
    let background = core.settings.configs.background;
    let accent = core.settings.configs.accent;
    const STYLE = document.documentElement.style;

    document.documentElement.classList.add("notransition");
    switch (background) {
        case "dark":
            STYLE.setProperty("--contrastColor", "#000");
            STYLE.setProperty("--baseColor", "#eee");
            STYLE.setProperty("--baseFilter", "invert(0.9)");
            STYLE.setProperty("--alpha", "1");
            STYLE.colorScheme = "dark";
            break;
        case "light":
            STYLE.setProperty("--contrastColor", "#fff");
            STYLE.setProperty("--baseColor", "#111");
            STYLE.setProperty("--baseFilter", "invert(0.1)");
            STYLE.setProperty("--alpha", "0.15");
            STYLE.colorScheme = "light";
            break;
    }

    switch (accent) {
        case "lightning":
            STYLE.setProperty("--accent", "hsl(190, 82.5%, 45%)");
            STYLE.setProperty("--accentFilter", "brightness(0) saturate(100%) invert(50%) sepia(94%) saturate(2762%) hue-rotate(156deg) brightness(106%) contrast(84%)");
            break;
        case "acid":
            STYLE.setProperty("--accent", "hsl(125, 82.5%, 45%)");
            STYLE.setProperty("--accentFilter", "brightness(0) saturate(100%) invert(50%) sepia(82%) saturate(1810%) hue-rotate(86deg) brightness(110%) contrast(91%)");
            break;
        case "amber":
            STYLE.setProperty("--accent", "hsl(45, 82.5%, 45%)");
            STYLE.setProperty("--accentFilter", "brightness(0) saturate(100%) invert(76%) sepia(85%) saturate(2552%) hue-rotate(4deg) brightness(92%) contrast(84%)");
            break;
        case "arcane":
            STYLE.setProperty("--accent", "hsl(260, 100%, 64%)");
            STYLE.setProperty("--accentFilter", "brightness(0) saturate(100%) invert(29%) sepia(33%) saturate(5426%) hue-rotate(245deg) brightness(107%) contrast(116%)");
            break;
    }
    window.requestAnimationFrame(() => {
        document.documentElement.classList.remove("notransition");
    });
}

export function spawnRipple(mouseEvent, element) {
    if (element.disabled) return;
    document.querySelectorAll(".ripple").forEach(el => {el.remove();})
    // Create a ripple element
    const rippleEl = document.createElement('div');
    rippleEl.classList.add('ripple');

    // Position the ripple
    let x = element.offsetWidth / (Math.floor(Math.random() * 5) + 1);
    let y = element.offsetHeight / (Math.floor(Math.random() * 5) + 1);

    if (!mouseEvent.simulated) {
        x = mouseEvent.offsetX;
        y = mouseEvent.offsetY;
    }

    rippleEl.style.left = `${x}px`;
    rippleEl.style.top = `${y}px`;
    element.appendChild(rippleEl);

    requestAnimationFrame(() => {
        rippleEl.classList.add('run');
    });

    let cleanup =     setTimeout(() => {rippleEl.remove();}, 750);
    // Remove ripple element when the transition is done
    rippleEl.addEventListener('transitionend', () => {
        clearTimeout(cleanup);
        rippleEl.remove();
    });

    return rippleEl;
}