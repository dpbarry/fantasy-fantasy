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
        b.onpointerdown = () => core.ui.show(b.dataset.loc, b.dataset.panel);
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