import createTooltipService from "../Services/TooltipService.js";
import createContextMenuService from "../Services/ContextMenuService.js";
import setupKeyboard from "../UI/Components/Keyboard.js";
import setupGlobalBehavior, {spawnRipple} from "../Services/GlobalBehavior.js";
import {verticalScroll} from "../Utils.js";
import StoryPanel from "../UI/Panels/StoryPanel.js";
import NewsPanel from "../UI/Panels/NewsPanel.js";
import SettingsPanel from "../UI/Panels/SettingsPanel.js";
import IndustryPanel from "../UI/Panels/IndustryPanel.js";

export default class UIManager {
    constructor(core) {
        this.core = core;
        this.activePanels = {
            "left": "",
            "center": "story",
            "right": "settings"
        };
        this.visibleSection = "center";
        this.renderLoops = [];
        this.initialize();
    }

    // after initialization so that the necessary managers are formed
    readyPanels() {
        this.panels = {
            story: new StoryPanel(this.core),
            news: new NewsPanel(this.core),
            settings: new SettingsPanel(this.core),
            industry: new IndustryPanel(this.core),
        }

        this.postPanelInitialization();
    }

     postPanelInitialization() {
        this.tooltipService = createTooltipService(this.core, this);
        this.contextMenuService = createContextMenuService(this.core, this.tooltipService);
        this.tooltipService.setContextMenuService(this.contextMenuService);
        
        // Listen for section changes in mobile view
        const sectionsWrapper = document.getElementById("sections-wrapper");
        if (sectionsWrapper) {
            let lastVisibleSection = this.visibleSection;
            const sectionOrder = ["left", "center", "right"];
            
            const detectVisibleSection = () => {
                const sections = sectionsWrapper.querySelectorAll("section");
                if (sections.length !== 3) return;
                
                const scrollLeft = sectionsWrapper.scrollLeft;
                const wrapperWidth = sectionsWrapper.clientWidth;
                const centerX = scrollLeft + wrapperWidth / 2;
                
                let closestSection = null;
                let closestDistance = Infinity;
                
                sections.forEach((section, index) => {
                    const sectionLeft = section.offsetLeft;
                    const sectionCenter = sectionLeft + section.offsetWidth / 2;
                    const distance = Math.abs(centerX - sectionCenter);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestSection = sectionOrder[index];
                    }
                });
                
                if (closestSection && closestSection !== this.visibleSection) {
                    this.visibleSection = closestSection;
                    this.updateMobileNavArrows();
                }
            };
            
            let scrollTimeout = null;
            let lastScrollLeft = sectionsWrapper.scrollLeft;
            
            const checkSectionChange = () => {
                const isScrolling = Math.abs(sectionsWrapper.scrollLeft - lastScrollLeft) > 1;
                lastScrollLeft = sectionsWrapper.scrollLeft;
                
                if (isScrolling) {
                    document.querySelectorAll('.infobox[data-infobox-section]').forEach(infobox => {
                        infobox.style.display = 'none';
                    });
                }
                
                detectVisibleSection();
                if (this.visibleSection !== lastVisibleSection) {
                    lastVisibleSection = this.visibleSection;
                    this.tooltipService.checkSectionAndDismiss();
                    
                    if (scrollTimeout) clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        if (window.matchMedia('(width <= 950px)').matches) {
                            this.updateInfoboxVisibility(true);
                        }
                    }, 300);
                }
            };
            
            this.updateInfoboxVisibility(true);
            window.addEventListener('resize', () => this.updateInfoboxVisibility(true), { passive: true });
            sectionsWrapper.addEventListener('scroll', checkSectionChange, { passive: true });
            
            const originalShow = this.show.bind(this);
            this.show = (loc, panel) => {
                originalShow(loc, panel);
                checkSectionChange();
            };
        }
    }

    boot() {
        setupGlobalBehavior(this.core);
        this.showPanels();
        if (this.updateMobileNavArrows) {
            this.updateMobileNavArrows();
        }
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("news");

        this.left = document.getElementById("left");
        this.center = document.getElementById("center");
        this.right = document.getElementById("right");

        this.industry = document.getElementById("industry");

        this.settings = document.getElementById("settings");
        
        this.canvas = this.newCanvas();
    }

    initialize() {
        this.initNavbar();
        this.initShortcuts();
        this.initEventListeners();
        this.initMobileNavigation();
    }

    initNavbar() {
        const navButtons = document.querySelectorAll(".navbutton");
        navButtons.forEach(b => {
            b.onpointerdown = () => this.show(b.dataset.loc, b.dataset.panel);
        });
    }

    newCanvas() {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '1000';
        document.body.appendChild(canvas);
        
        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        return canvas;
    }

    initEventListeners() {
        document.querySelectorAll(".nudge").forEach(b => b.addEventListener("pointerdown", () => b.classList.add("nudged")));
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        document.querySelectorAll(".ripples").forEach(el => {
            el.addEventListener("pointerdown", (e) => {
                spawnRipple(e, el);
            });
        });

        const interactiveObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { 
                        if (node.classList.contains("nudge")) {
                            node.addEventListener("pointerdown", () => node.classList.add("nudged"));
                        }
                        if (node.classList.contains("ripples")) {
                            node.addEventListener("click", (e) => {
                                spawnRipple(e, node);
                            });
                        }

                        node.querySelectorAll?.(".nudge").forEach(b => {
                            b.addEventListener("pointerdown", () => b.classList.add("nudged"));
                        });
                        node.querySelectorAll?.(".ripples").forEach(el => {
                            el.addEventListener("click", (e) => {
                                spawnRipple(e, el);
                            });
                        });
                    }
                });
            });
        });

        interactiveObserver.observe(document.body, {
            childList: true, subtree: true
        });

        setupKeyboard();
        this.story.addEventListener("scroll", () => {
            verticalScroll(this.story, 5, true);
        });
        window.addEventListener("resize", () => {
            verticalScroll(this.story, 5, true);
        });
    }


    show(loc, panel) {
        if (this.activePanels[loc] === undefined || !panel) return;

        if (this.activePanels[loc] && this.activePanels[loc] !== panel) {
            this.panels[this.activePanels[loc]].updateVisibility(loc, panel);
        }
        this.activePanels[loc] = panel;
        this.panels[panel].updateVisibility(loc, panel);

        document.querySelectorAll(`.navbutton.chosen[data-loc='${loc}']`).forEach(el => el.classList.remove("chosen"));
        let button = document.querySelector(`.navbutton[data-panel='${panel}']`);
        if (button) {
            button.classList.add("chosen");
        }
    }

    showPanels() {
        Object.entries(this.activePanels).forEach((a) => {
            let [loc, panel] = a;
            this.show(loc, panel);
        });
    }

    createRenderInterval(fn) {
        const interval =  setInterval(() => {fn();}, this.core.settings.refreshUI);
        this.renderLoops.push({interval: interval, fn: fn});
        return interval;
    }

    destroyRenderInterval(interval) {
        const i = this.renderLoops.findIndex(i => i.interval === interval);
        clearInterval(interval);
        this.renderLoops.splice(i, 1);
    }

    updateRenderIntervals() {
        for (const pair of this.renderLoops) {
           clearInterval(pair.interval);
           pair.interval = setInterval(pair.fn, this.core.settings.refreshUI);
        }
    }

    serialize() {
        return {activePanels: this.activePanels, visibleSection: this.visibleSection};
    }

    deserialize(data) {
        this.activePanels = data.activePanels;
        this.visibleSection = data.visibleSection;
        if (this.updateMobileNavArrows) {
            this.updateMobileNavArrows();
        }
    }

    initMobileNavigation() {
        const sectionsWrapper = document.getElementById("sections-wrapper");
        if (!sectionsWrapper) return;

        const sectionOrder = ["left", "center", "right"];
        
        const navigateSection = (direction) => {
            const currentIndex = sectionOrder.indexOf(this.visibleSection);
            if (currentIndex === -1) return;

            let targetIndex;
            if (direction === "left") {
                targetIndex = currentIndex - 1;
            } else {
                targetIndex = currentIndex + 1;
            }

            if (targetIndex < 0 || targetIndex >= sectionOrder.length) return;

            const targetSection = sectionOrder[targetIndex];
            this.visibleSection = targetSection;
            if (this.scrollToVisibleSection) {
                this.scrollToVisibleSection(true);
            }
            this.updateMobileNavArrows();
        };

        const leftArrows = [
            document.getElementById("nav-arrow-left"),
            document.getElementById("nav-arrow-center-from-right"),
            document.getElementById("nav-arrow-right-from-left")
        ];

        const rightArrows = [
            document.getElementById("nav-arrow-center-from-left"),
            document.getElementById("nav-arrow-right-from-center"),
            document.getElementById("nav-arrow-right")
        ];

        leftArrows.forEach(arrow => {
            if (arrow) arrow.addEventListener("click", () => navigateSection("left"));
        });

        rightArrows.forEach(arrow => {
            if (arrow) arrow.addEventListener("click", () => navigateSection("right"));
        });

        this.updateMobileNavArrows();
        
        const checkMobileNav = () => {
            const isMobile = window.matchMedia("(width <= 950px)").matches;
            if (isMobile) {
                this.updateMobileNavArrows();
            }
        };

        window.addEventListener("resize", checkMobileNav);
    }

    updateInfoboxVisibility(immediate = true) {
        const isMobile = window.matchMedia('(width <= 950px)').matches;
        if (!isMobile) {
            document.querySelectorAll('.infobox').forEach(infobox => infobox.style.display = '');
            return;
        }
        if (!immediate) return;
        
        document.querySelectorAll('.infobox').forEach(infobox => {
            const section = infobox.dataset.infoboxSection;
            infobox.style.display = (section && section !== this.visibleSection) ? 'none' : '';
        });
    }

    updateMobileNavArrows() {
        const sectionOrder = ["left", "center", "right"];
        const currentIndex = sectionOrder.indexOf(this.visibleSection);
        if (currentIndex === -1) return;

        const leftArrowLeft = document.getElementById("nav-arrow-left");
        const leftArrowCenter = document.getElementById("nav-arrow-center-from-right");
        const leftArrowRight = document.getElementById("nav-arrow-right-from-left");

        const rightArrowLeft = document.getElementById("nav-arrow-center-from-left");
        const rightArrowCenter = document.getElementById("nav-arrow-right-from-center");
        const rightArrowRight = document.getElementById("nav-arrow-right");

        if (leftArrowLeft) leftArrowLeft.disabled = currentIndex === 0;
        if (leftArrowCenter) leftArrowCenter.disabled = currentIndex !== 1;
        if (leftArrowRight) leftArrowRight.disabled = currentIndex !== 2;

        if (rightArrowLeft) rightArrowLeft.disabled = currentIndex !== 0;
        if (rightArrowCenter) rightArrowCenter.disabled = currentIndex !== 1;
        if (rightArrowRight) rightArrowRight.disabled = currentIndex === 2;
    }
}
