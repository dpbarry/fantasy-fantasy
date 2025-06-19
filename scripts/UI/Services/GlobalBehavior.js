import HackService from "./HackService.js";

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;

    const settingsButton = document.querySelector("#settingsnav");
    if (!settingsButton) return;

    settingsButton.addEventListener("click", () => {
        if (++settingsClicks >= 5) {
            HackService.show(core);
            settingsClicks = 0;
        }
    });

    const navbuttons = document.querySelectorAll(".navbutton");
    navbuttons.forEach(b => {
        b.onpointerdown = () => {
            if (b.classList.contains("locked")) return;
            core.ui.show(b.dataset.loc, b.dataset.panel);
        }
    })
    const carousel = document.querySelector("body");
    const left = document.getElementById("left-section");
    const center = document.getElementById('center-section');
    const right = document.getElementById("right-section");

    const scrollSection = (s, behavior) => {
        let section = s === "center" ? center : s === "left" ? left : right;

        section.scrollIntoView({behavior: behavior});
    }

    scrollSection(core.ui.visibleSection, "auto");

    carousel.addEventListener("scroll", () => {
        const cw = carousel.clientWidth;
        const scrollX = carousel.scrollLeft;

        const index = Math.round(scrollX / cw);

        core.ui.visibleSection = index === 0 ? "left" : index === 1 ? "center" : "right";
    });

    window.addEventListener("resize", () => {
        scrollSection(core.ui.visibleSection, "auto");
    });
}

export function applyTheme(core) {
    let background = core.settings.configs.background;
    let accent = core.settings.configs.accent;
    const STYLE = document.documentElement.style;

    document.documentElement.classList.add("notransition");
    switch (background) {
        case "black":
            STYLE.setProperty("--contrastColor", "#000");
            STYLE.setProperty("--baseColor", "#eee");
            STYLE.setProperty("--baseFilter", "invert(0.97)");
            break;
        case "dark":
            STYLE.setProperty("--contrastColor", "#111");
            STYLE.setProperty("--baseColor", "#eee");
            STYLE.setProperty("--baseFilter", "invert(0.97)");
            break;
        case "pastel":
            STYLE.setProperty("--contrastColor", "color-mix(in hsl, var(--accent), #fff 80%)");
            STYLE.setProperty("--baseColor", "#111");
            STYLE.setProperty("--baseFilter", "invert(0.1)");
            break;
        case "light":
            STYLE.setProperty("--contrastColor", "#fff");
            STYLE.setProperty("--baseColor", "#111");
            STYLE.setProperty("--baseFilter", "invert(0.1)");
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