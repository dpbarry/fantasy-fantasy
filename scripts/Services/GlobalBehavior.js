import HackService from "./HackService.js";

const MOBILE_BREAKPOINT = "(width <= 950px)";
const SECTION_ORDER = ["left", "center", "right"];

function matchesMobile() {
    return window.matchMedia(MOBILE_BREAKPOINT).matches;
}

export default function setupGlobalBehavior(core) {
    let settingsClicks = 0;
    let isMobile = matchesMobile();

    const inputObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'INPUT') {
                        node.autocomplete = "off";
                        node.inputMode = "none";
                        node.spellcheck = false;
                    }
                    if (node.tagName === 'FORM') {
                        node.setAttribute('novalidate', '');
                    }
                    const inputs = node.querySelectorAll ? node.querySelectorAll('input') : [];
                    inputs.forEach(input => {
                        input.autocomplete = "off";
                        input.inputMode = "none";
                        input.spellcheck = false;
                    });
                    const forms = node.querySelectorAll ? node.querySelectorAll('form') : [];
                    forms.forEach(form => {
                        form.setAttribute('novalidate', '');
                    });
                }
            });
        });
    });

    document.querySelectorAll('input').forEach(input => {
        input.autocomplete = "off";
        input.inputMode = "none";
        input.spellcheck = false;
    });
    document.querySelectorAll('form').forEach(form => {
        form.setAttribute('novalidate', '');
    });

    inputObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

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

    const focusNewSection = () => {
        if (!matchesMobile()) return;

        const visibleSection = document.querySelector(`.main-section[id="${core.ui.visibleSection}-section"]`);
        if (!visibleSection) return;

        const focusableElements = visibleSection.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const visibleFocusable = Array.from(focusableElements).filter(el =>
            el.offsetParent !== null &&
            !el.hasAttribute('disabled') &&
            !el.classList.contains('locked') &&
            !el.classList.contains('tab-goalpost') &&
            el.tabIndex !== -1
        );

        if (visibleFocusable.length > 0) {
            visibleFocusable[0].focus();
        }
    };

    function initMobileNavigation() {
        if (!sectionsWrapper) return;

        const navigateSection = (direction) => {
            document.querySelector(`.main-section[id="${core.ui.visibleSection}-section"]`).classList.remove("active");

            const currentIndex = SECTION_ORDER.indexOf(core.ui.visibleSection);
            if (currentIndex === -1) return;

            const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
            if (targetIndex < 0 || targetIndex >= SECTION_ORDER.length) return;

            core.ui.visibleSection = SECTION_ORDER[targetIndex];
            document.querySelector(`.main-section[id="${core.ui.visibleSection}-section"]`).classList.add("active");
            scrollToVisibleSection(true);
            core.ui.updateMobileNavArrows();
            updateTabTrapping();
            focusNewSection();
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
                createGoalposts();
                updateTabTrapping();
                scrollToVisibleSection(false);
                focusNewSection();
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
                    updateTabTrapping();
                }, 150);
            }
        } else if (!isMobile && wasMobile) {
            isResizing = false;
            if (resizeAnimationFrame) {
                cancelAnimationFrame(resizeAnimationFrame);
                resizeAnimationFrame = null;
            }
            core.ui.updateMobileNavArrows();
            createGoalposts();
            updateTabTrapping();
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

        try {
            document.querySelector(`.main-section[id="${core.ui.visibleSection}-section"]`).classList.remove("active");
        } catch { }

        if (closestSection) {
            core.ui.visibleSection = closestSection;
            document.querySelector(`.main-section[id="${core.ui.visibleSection}-section"]`).classList.add("active");
            core.ui.updateMobileNavArrows();
            core.ui.tooltipService?.checkSectionAndDismiss();
            focusNewSection();
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
            get: function () {
                if (isProgrammaticScroll && sectionsWrapper.style.overflowX === 'scroll') {
                    return getScrollLeft();
                }
                return _scrollLeft;
            },
            set: function (value) {
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

        lockedScrollLeft = sectionsWrapper.scrollLeft;
        _scrollLeft = sectionsWrapper.scrollLeft;
    };

    updateScrollBehavior();

    let tabKeyHandler = null;

    // Goalposts: invisible focusable elements for mobile tab trapping
    function createGoalposts() {
        const sections = document.querySelectorAll('.main-section');
        sections.forEach(section => {
            const existingTop = section.querySelector('.tab-goalpost-top');
            const existingBottom = section.querySelector('.tab-goalpost-bottom');
            if (existingTop) existingTop.remove();
            if (existingBottom) existingBottom.remove();

            const topGoalpost = document.createElement('span');
            topGoalpost.className = 'tab-goalpost tab-goalpost-top';
            topGoalpost.tabIndex = matchesMobile() ? 0 : -1;
            topGoalpost.setAttribute('aria-hidden', 'true');
            topGoalpost.style.cssText = `position: absolute; top: -10px; left: -10px; width: 1px; height: 1px; padding: 0; margin: 0; border: none; opacity: 0; pointer-events: none;`;

            const bottomGoalpost = document.createElement('span');
            bottomGoalpost.className = 'tab-goalpost tab-goalpost-bottom';
            bottomGoalpost.tabIndex = matchesMobile() ? 0 : -1;
            bottomGoalpost.setAttribute('aria-hidden', 'true');
            bottomGoalpost.style.cssText = `position: absolute; bottom: -10px; left: -10px; width: 1px; height: 1px; padding: 0; margin: 0; border: none; opacity: 0; pointer-events: none;`;

            topGoalpost.addEventListener('focus', () => {
                if (!matchesMobile()) return;
                const section = topGoalpost.closest('.main-section');
                const focusableElements = section.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                const visibleFocusable = Array.from(focusableElements).filter(el =>
                    el.offsetParent !== null && !el.hasAttribute('disabled') && !el.classList.contains('locked') && !el.classList.contains('tab-goalpost') && el.tabIndex !== -1
                );
                if (visibleFocusable.length > 0) visibleFocusable[visibleFocusable.length - 1].focus();
            });

            bottomGoalpost.addEventListener('focus', () => {
                if (!matchesMobile()) return;
                const section = bottomGoalpost.closest('.main-section');
                const focusableElements = section.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                const visibleFocusable = Array.from(focusableElements).filter(el =>
                    el.offsetParent !== null && !el.hasAttribute('disabled') && !el.classList.contains('locked') && !el.classList.contains('tab-goalpost') && el.tabIndex !== -1
                );
                if (visibleFocusable.length > 0) visibleFocusable[0].focus();
            });

            section.insertBefore(topGoalpost, section.firstChild);
            section.appendChild(bottomGoalpost);
        });
    }

    function updateTabTrapping() {
        if (tabKeyHandler) document.removeEventListener('keydown', tabKeyHandler);

        const goalposts = document.querySelectorAll('.tab-goalpost');
        goalposts.forEach(goalpost => { goalpost.tabIndex = matchesMobile() ? 0 : -1; });

        document.addEventListener('keydown', tabKeyHandler);
    }

    createGoalposts();
    updateTabTrapping();

    // Space/Enter triggers click on interactive elements
    document.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        const target = document.activeElement;
        if (!target) return;

        const interactiveElements = ['button', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="image"]', '[role="button"]', '[role="menuitem"]', '[role="option"]', '[role="tab"]', '.navbutton', '.ripples'];
        const isInteractive = interactiveElements.some(selector => target.matches(selector)) || target.onclick !== null || target.onpointerdown !== null || target.getAttribute('onclick') !== null;

        if (target.tagName === 'INPUT' && !['button', 'submit', 'reset', 'image'].includes(target.type)) return;
        if (target.tagName === 'TEXTAREA' || target.contentEditable === 'true') return;

        if (isInteractive) {
            e.preventDefault();
            target.click();
            target.dispatchEvent(new Event('pointerdown', { simulated: true }));
            target.dispatchEvent(new Event('pointerup'));
        }
    });

    if (matchesMobile() && sectionsWrapper) scrollToVisibleSection(false);
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