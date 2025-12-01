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

    function scrollToVisibleSection(smooth = false) {
        if (!isMobile || !sectionsWrapper) return;
        
        const sectionIndex = sectionMap[core.ui.visibleSection];
        if (sectionIndex === undefined) return;
        
        const sections = sectionsWrapper.querySelectorAll("section");
        if (!sections[sectionIndex]) return;
        
        const section = sections[sectionIndex];
        const sectionLeft = section.offsetLeft;
        const sectionWidth = section.offsetWidth;
        const wrapperWidth = sectionsWrapper.clientWidth;
        
        const targetLeft = sectionLeft + (sectionWidth / 2) - (wrapperWidth / 2);
        
        const originalScrollBehavior = sectionsWrapper.style.scrollBehavior;
        const originalScrollSnapType = sectionsWrapper.style.scrollSnapType;
        sectionsWrapper.style.scrollBehavior = 'auto';
        sectionsWrapper.style.scrollSnapType = 'none';
        
        if (smooth) {
            const startLeft = sectionsWrapper.scrollLeft;
            const distance = targetLeft - startLeft;
            const duration = 150;
            const startTime = performance.now();
            
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress * (2 - progress);
                sectionsWrapper.scrollLeft = startLeft + distance * ease;
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    sectionsWrapper.style.scrollBehavior = originalScrollBehavior;
                    sectionsWrapper.style.scrollSnapType = originalScrollSnapType;
                }
            };
            requestAnimationFrame(animate);
        } else {
            sectionsWrapper.scrollLeft = targetLeft;
            requestAnimationFrame(() => {
                sectionsWrapper.style.scrollBehavior = originalScrollBehavior;
                sectionsWrapper.style.scrollSnapType = originalScrollSnapType;
            });
        }
    }
    
    core.ui.scrollToVisibleSection = scrollToVisibleSection;

    const navbuttons = document.querySelectorAll(".navbutton");
    navbuttons.forEach(b => {
        b.onpointerdown = () => {
            if (b.classList.contains("locked")) return;
            core.ui.show(b.dataset.loc, b.dataset.panel);
        }
    });

    let resizeTimeout = null;
    let resizeAnimationFrame = null;
    let isResizing = false;
    
    const lockScrollPosition = () => {
        if (!isMobile || !sectionsWrapper || !isResizing) return;
        
        const sectionIndex = sectionMap[core.ui.visibleSection];
        if (sectionIndex === undefined) return;
        
        const sections = sectionsWrapper.querySelectorAll("section");
        if (!sections[sectionIndex]) return;
        
        const section = sections[sectionIndex];
        const sectionLeft = section.offsetLeft;
        const sectionWidth = section.offsetWidth;
        const wrapperWidth = sectionsWrapper.clientWidth;
        
        const targetLeft = sectionLeft + (sectionWidth / 2) - (wrapperWidth / 2);
        sectionsWrapper.scrollLeft = targetLeft;
        
        resizeAnimationFrame = requestAnimationFrame(lockScrollPosition);
    };
    
    const resizeHandler = () => {
        const wasMobile = isMobile;
        isMobile = window.matchMedia("(width <= 950px)").matches;
        
        if (isMobile && sectionsWrapper) {
            if (!wasMobile) {
                core.ui.visibleSection = "center";
                scrollToVisibleSection(false);
                if (core.ui.updateMobileNavArrows) {
                    core.ui.updateMobileNavArrows();
                }
            } else {
                if (!isResizing) {
                    isResizing = true;
                    resizeAnimationFrame = requestAnimationFrame(lockScrollPosition);
                }
                
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    isResizing = false;
                    if (resizeAnimationFrame) {
                        cancelAnimationFrame(resizeAnimationFrame);
                        resizeAnimationFrame = null;
                    }
                    scrollToVisibleSection(false);
                    if (core.ui.updateMobileNavArrows) {
                        core.ui.updateMobileNavArrows();
                    }
                }, 150);
            }
        } else if (!isMobile && wasMobile) {
            isResizing = false;
            if (resizeAnimationFrame) {
                cancelAnimationFrame(resizeAnimationFrame);
                resizeAnimationFrame = null;
            }
            if (core.ui.updateMobileNavArrows) {
                core.ui.updateMobileNavArrows();
            }
        }
    };

    window.addEventListener("resize", resizeHandler, { passive: true });

    if (sectionsWrapper) {
        const sectionOrder = ["left", "center", "right"];
        let scrollTimeout = null;
        
        const detectVisibleSection = () => {
            if (isResizing) return;
            
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
            
            if (closestSection && closestSection !== core.ui.visibleSection) {
                core.ui.visibleSection = closestSection;
                if (core.ui.updateMobileNavArrows) {
                    core.ui.updateMobileNavArrows();
                }
                if (core.ui.tooltipService) {
                    core.ui.tooltipService.checkSectionAndDismiss();
                }
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    if (window.matchMedia('(width <= 950px)').matches && core.ui.updateInfoboxVisibility) {
                        core.ui.updateInfoboxVisibility(true);
                    }
                }, 300);
            }
        };
        
        core.ui.detectVisibleSection = detectVisibleSection;
        
        if (isMobile) {
            let lockedScrollLeft = sectionsWrapper.scrollLeft;
            let isProgrammaticScroll = false;
            let lastScrollTime = 0;
            
            const updateLock = () => {
                lockedScrollLeft = sectionsWrapper.scrollLeft;
            };
            
            sectionsWrapper.style.overflowX = 'hidden';
            const originalScrollTo = sectionsWrapper.scrollTo;
            sectionsWrapper.scrollTo = function(options) {
                if (options && typeof options.left !== 'undefined') {
                    sectionsWrapper.style.overflowX = 'scroll';
                    originalScrollTo.call(this, options);
                    requestAnimationFrame(() => {
                        sectionsWrapper.style.overflowX = 'hidden';
                        lockedScrollLeft = sectionsWrapper.scrollLeft;
                    });
                } else {
                    originalScrollTo.call(this, options);
                }
            };
            
            Object.defineProperty(sectionsWrapper, 'scrollLeft', {
                get: function() {
                    return lockedScrollLeft;
                },
                set: function(value) {
                    if (isProgrammaticScroll) {
                        lockedScrollLeft = value;
                        sectionsWrapper.style.overflowX = 'scroll';
                        sectionsWrapper.style.scrollLeft = value;
                        requestAnimationFrame(() => {
                            sectionsWrapper.style.overflowX = 'hidden';
                        });
                    }
                },
                configurable: true
            });
            
            sectionsWrapper.addEventListener("scroll", () => {
                const now = performance.now();
                if (now - lastScrollTime < 16) return;
                lastScrollTime = now;
                
                if (isProgrammaticScroll) {
                    updateLock();
                    detectVisibleSection();
                    return;
                }
                
                detectVisibleSection();
            }, { passive: true });
            
            scrollToVisibleSection(false);
            updateLock();
            
            const originalScrollToVisibleSection = core.ui.scrollToVisibleSection;
            core.ui.scrollToVisibleSection = (smooth = false) => {
                isProgrammaticScroll = true;
                originalScrollToVisibleSection(smooth);
                if (smooth) {
                    setTimeout(() => {
                        updateLock();
                        isProgrammaticScroll = false;
                    }, 160);
                } else {
                    requestAnimationFrame(() => {
                        updateLock();
                        isProgrammaticScroll = false;
                    });
                }
            };
        } else {
            sectionsWrapper.addEventListener("scroll", detectVisibleSection, { passive: true });
        }
    }
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