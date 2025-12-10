import HackService from "./HackService.js";

const MOBILE_BREAKPOINT = "(width <= 950px)";
const SECTION_ORDER = ["left", "center", "right"];

function matchesMobile() {
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
}

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;
    let isMobile = matchesMobile();

    const settingsButton = document.querySelector("#settingsnav");
    if (!settingsButton) return;

    settingsButton.addEventListener("click", async () => {
        if (++settingsClicks >= 5) {
            await HackService.show(core);
            settingsClicks = 0;
        }
    });

    const sectionsWrapper = document.querySelector("#sections-wrapper");
    const sectionMap = {
        "left": 0,
        "center": 1,
        "right": 2
    };
    let isProgrammaticScroll = false;
    function calculateTargetLeft(section) {
        const sectionLeft = section.offsetLeft;
        const sectionWidth = section.offsetWidth;
        const wrapperWidth = sectionsWrapper.clientWidth;
        return sectionLeft + (sectionWidth / 2) - (wrapperWidth / 2);  
      }

    function scrollToVisibleSection(smooth = false) {
        if (!matchesMobile() || !sectionsWrapper) return;

        const sectionIndex = sectionMap[core.ui.visibleSection];
        if (sectionIndex === undefined) return;

        const sections = sectionsWrapper.querySelectorAll("section");
        if (!sections[sectionIndex]) return;

        const section = sections[sectionIndex];

        isProgrammaticScroll = true;

        if (smooth) {
            sectionsWrapper.style.scrollSnapType = 'none';
            const startLeft = sectionsWrapper.scrollLeft;
            const targetLeft = calculateTargetLeft(section);
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
                    isProgrammaticScroll = false;
                    sectionsWrapper.style.scrollSnapType = "x mandatory";
                }
            };
            requestAnimationFrame(animate);
        } else {
            sectionsWrapper.scrollLeft = calculateTargetLeft(section);
            requestAnimationFrame(() => {
                isProgrammaticScroll = false;
            });
        }
    }
    

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
        if (!matchesMobile() || !sectionsWrapper || !isResizing) return;

        const sectionIndex = sectionMap[core.ui.visibleSection];
        if (sectionIndex === undefined) return;

        const sections = sectionsWrapper.querySelectorAll("section");
        if (!sections[sectionIndex]) return;

        const section = sections[sectionIndex];
        sectionsWrapper.scrollLeft = calculateTargetLeft(section);

        resizeAnimationFrame = requestAnimationFrame(lockScrollPosition);
    };
    
    function updateInfoboxVisibility(immediate = true) {
        if (!matchesMobile()) {
            document.querySelectorAll('.infobox').forEach(infobox => infobox.style.display = '');
            return;
        }
        if (!immediate) return;
        
        document.querySelectorAll('.infobox').forEach(infobox => {
            const section = infobox.dataset.infoboxSection;
            infobox.style.display = (section && section !== core.ui.visibleSection) ? 'none' : '';
        });
    }

    function setupInfoBoxScrollInteraction() {
        if (!sectionsWrapper) return;
        
        let lastScrollLeft = sectionsWrapper.scrollLeft;
        let scrollTimeout = null;
        
        sectionsWrapper.addEventListener('scroll', () => {
            const isScrolling = Math.abs(sectionsWrapper.scrollLeft - lastScrollLeft) > 1;
            lastScrollLeft = sectionsWrapper.scrollLeft;
            
            if (isScrolling) {
                document.querySelectorAll('.infobox[data-infobox-section]').forEach(infobox => {
                    infobox.style.display = 'none';
                });
                
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => updateInfoboxVisibility(true), 300);
            }
        }, { passive: true });
        
        updateInfoboxVisibility(true);
        window.addEventListener('resize', () => updateInfoboxVisibility(true), { passive: true });
    }

    function initMobileNavigation() {
        if (!sectionsWrapper) return;

        const navigateSection = (direction) => {
            const currentIndex = SECTION_ORDER.indexOf(core.ui.visibleSection);
            if (currentIndex === -1) return;

            const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= SECTION_ORDER.length) return;

            core.ui.visibleSection = SECTION_ORDER[targetIndex];
            scrollToVisibleSection(true);
            core.ui.updateMobileNavArrows();
        };

        const arrowIds = {
            left: ["nav-arrow-left", "nav-arrow-center-from-right", "nav-arrow-right-from-left"],
            right: ["nav-arrow-center-from-left", "nav-arrow-right-from-center", "nav-arrow-right"]
        };

        arrowIds.left.forEach(id => {
            const arrow = document.getElementById(id);
            if (arrow) arrow.addEventListener("click", () => navigateSection("left"));
        });

        arrowIds.right.forEach(id => {
            const arrow = document.getElementById(id);
            if (arrow) arrow.addEventListener("click", () => navigateSection("right"));
        });
    }

    const updateScrollBehavior = () => {
        const shouldBeMobile = matchesMobile();
        
        if (shouldBeMobile) {
            setupMobileScrollLocking();
        } else {
            if (mobileScrollHandler) {
                sectionsWrapper.removeEventListener("scroll", mobileScrollHandler);
                mobileScrollHandler = null;
            }
            if (scrollLeftPropertyDefined) {
                delete sectionsWrapper.scrollLeft;
                scrollLeftPropertyDefined = false;
                sectionsWrapper.style.overflowX = '';
            }
        }
    };
    
    const resizeHandler = () => {
        const wasMobile = isMobile;
        isMobile = matchesMobile();
        
        if (isMobile && sectionsWrapper) {
            if (!wasMobile) {
                core.ui.visibleSection = "center";
                core.ui.updateMobileNavArrows();
                updateScrollBehavior();
                scrollToVisibleSection(false);
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
                    core.ui.updateMobileNavArrows();
                }, 150);
            }
        } else if (!isMobile && wasMobile) {
            isResizing = false;
            if (resizeAnimationFrame) {
                cancelAnimationFrame(resizeAnimationFrame);
                resizeAnimationFrame = null;
            }
            core.ui.updateMobileNavArrows();
        }
    };

    window.addEventListener("resize", resizeHandler, { passive: true });

    let scrollTimeout = null;
    let lockedScrollLeft = 0;
    let lastScrollTime = 0;
    let _scrollLeft = 0;
    let mobileScrollHandler = null;
    let scrollLeftPropertyDefined = false;
    
    const detectVisibleSection = () => {
        if (!sectionsWrapper || isResizing) return;

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
                closestSection = SECTION_ORDER[index];
            }
        });

        if (closestSection && closestSection !== core.ui.visibleSection) {
            core.ui.visibleSection = closestSection;
            core.ui.updateMobileNavArrows();
            core.ui.tooltipService?.checkSectionAndDismiss();
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                if (matchesMobile()) {
                    updateInfoboxVisibility(true);
                }
            }, 300);
        }
    };
    
    core.ui.detectVisibleSection = detectVisibleSection;
    
    setupInfoBoxScrollInteraction();
    initMobileNavigation();
    
    const setupMobileScrollLocking = () => {
        if (!sectionsWrapper || scrollLeftPropertyDefined) return;
        
        const setScrollLeftDirect = (value) => {
            sectionsWrapper.style.overflowX = 'scroll';
            const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft') ||
                Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
            if (descriptor && descriptor.set) {
                descriptor.set.call(sectionsWrapper, value);
            } else {
                sectionsWrapper.scrollLeft = value;
            }
            _scrollLeft = value;
            lockedScrollLeft = value;
            setTimeout(() => {
                sectionsWrapper.style.overflowX = 'hidden';
            }, 0);
        };
        
        const getScrollLeft = () => {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollLeft') || 
                Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
            if (descriptor && descriptor.get) {
                return descriptor.get.call(sectionsWrapper);
            }
            return sectionsWrapper.scrollLeft;
        };
        
        const updateLock = () => {
            lockedScrollLeft = _scrollLeft;
        };
        
        Object.defineProperty(sectionsWrapper, 'scrollLeft', {
            get: function() {
                if (isProgrammaticScroll && sectionsWrapper.style.overflowX === 'scroll') {
                    return getScrollLeft();
                }
                return _scrollLeft;
            },
            set: function(value) {
                if (isProgrammaticScroll || isResizing) {
                    setScrollLeftDirect(value);
                } else {
                    _scrollLeft = lockedScrollLeft;
                }
            },
            configurable: true
        });
        
        scrollLeftPropertyDefined = true;
        
        mobileScrollHandler = () => {
            const now = performance.now();
            if (now - lastScrollTime < 16) return;
            lastScrollTime = now;

            if (isProgrammaticScroll) {
                _scrollLeft = sectionsWrapper.scrollLeft;
                updateLock();
            } else {
                detectVisibleSection();
            }
        };
        
        sectionsWrapper.addEventListener("scroll", mobileScrollHandler, { passive: true });

        // Initialize with current scroll position
        lockedScrollLeft = sectionsWrapper.scrollLeft;
        _scrollLeft = sectionsWrapper.scrollLeft;
    };
    
    updateScrollBehavior();

    // On mobile, ensure we scroll to the correct section after scroll locking is set up
    if (matchesMobile() && sectionsWrapper) {
        scrollToVisibleSection(false);
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
    document.querySelectorAll(".ripple").forEach(el => el.remove());
    
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

    const cleanup = setTimeout(() => rippleEl.remove(), 750);
    // Remove ripple element when the transition is done
    rippleEl.addEventListener('transitionend', () => {
        clearTimeout(cleanup);
        rippleEl.remove();
    });

    return rippleEl;
}