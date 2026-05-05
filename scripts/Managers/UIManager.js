import createTooltipService from "../Services/TooltipService.js";
import createContextMenuService from "../Services/ContextMenuService.js";
import setupGlobalBehavior, {spawnRipple} from "../Services/GlobalBehavior.js";
import EffectsService from "../Services/EffectsService.js";
import {verticalScroll, formatNumber as baseFormatNumber} from "../Utils.js";
import StoryPanel from "../UI/Panels/StoryPanel.js";
import NewsPanel from "../UI/Panels/NewsPanel.js";
import SettingsPanel from "../UI/Panels/SettingsPanel.js";
import IndustryPanel from "../UI/Panels/IndustryPanel.js";

export default class UIManager {
    constructor(core) {
        this.core = core;
        this.mobileLayoutQuery = window.matchMedia("(width <= 850px)");
        this.ledgerVisibleQuery = window.matchMedia("(width > 1150px)");
        this.activePanels = {
            "main": "industry",
            "ledger": "log"
        };
        this.renderLoops = new Map();
        this.renderLoopSeed = 0;
        this.renderDriverId = null;
        this.initialize();
    }

    initialize() {
        this.initShortcuts();
        this.initEventListeners();
    }

    readyPanels() {
        this.panels = {
            story: new StoryPanel(this.core),
            news: new NewsPanel(this.core),
            settings: new SettingsPanel(this.core),
            industry: new IndustryPanel(this.core),
        };

        this.initNavButtonFocusability();
    }

    boot() {
        setupGlobalBehavior(this.core);
        EffectsService.init(this.canvas);
        this.effects = EffectsService;
        this.tooltipService = createTooltipService(this.core);
        this.contextMenuService = createContextMenuService(this.core, this.tooltipService);
        this.tooltipService.setContextMenuService(this.contextMenuService);
        this.setupMobileTopNavPager();
        this.showPanels();
        this.syncLedgerVisibilityState();
        this.panels.story.syncPreludeLayer();
        this.updateMobileNavArrows();
    }

    initShortcuts() {
        this.story = document.getElementById("story");
        this.news = document.getElementById("news");
        this.mainPanel = document.getElementById("main-panel");
        this.ledger = document.getElementById("ledger");
        this.industry = document.getElementById("industry");
        this.settings = document.getElementById("settings");
        this.topnav = document.getElementById("topnav");
        this.mobileNavViewport = document.getElementById("mobile-nav-viewport");
        this.mobileNavPrev = document.getElementById("mobile-nav-prev");
        this.mobileNavNext = document.getElementById("mobile-nav-next");
        this.canvas = this.newCanvas();
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
        const addNudgeListener = (el) => el.addEventListener("pointerdown", () => el.classList.add("nudged"));
        const addRippleListener = (el) => el.addEventListener("pointerdown", (e) => spawnRipple(e, el));

        document.querySelectorAll(".nudge").forEach(addNudgeListener);
        document.onpointerup = () => {
            document.querySelectorAll(".nudged").forEach(b => b.classList.remove("nudged"));
        };

        document.querySelectorAll(".ripples").forEach(addRippleListener);

        const interactiveObserver = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    
                    if (node.classList.contains("nudge")) {
                        addNudgeListener(node);
                    }
                    if (node.classList.contains("ripples")) {
                        node.addEventListener("pointerdown", (e) => spawnRipple(e, node));
                    }

                    node.querySelectorAll?.(".nudge").forEach(addNudgeListener);
                    node.querySelectorAll?.(".ripples").forEach(el => {
                        el.addEventListener("pointerdown", (e) => spawnRipple(e, el));
                    });
                });
            });
        });

        interactiveObserver.observe(document.body, {
            childList: true, subtree: true
        });

        const updateStoryScroll = () => {
            if (!this.story || !this.core.story?.prologueUnfinished) return;
            verticalScroll(this.story, 5, true);
        };

        this.story?.addEventListener("scroll", updateStoryScroll);
        window.addEventListener("resize", updateStoryScroll);
        window.addEventListener("resize", () => this.syncLedgerVisibilityState());

        document.addEventListener("keydown", (e) => this.handleGlobalHotkeys(e));

    }

    handleGlobalHotkeys(e) {
        const key = e.key;
        if (!key) return;

        if (key === "Escape") {
            return;
        }

        if (this.isTypingContext()) return;

        if (key.toLowerCase() === "n") {
            if (!this.isLedgerVisible()) return;
            e.preventDefault();
            this.show("ledger", "log");
            return;
        }

        const isPrevKey = key === "[" || key === "{";
        const isNextKey = key === "]" || key === "}";
        if (isPrevKey || isNextKey) {
            e.preventDefault();
            if (e.shiftKey) {
                this.cycleWithinCurrentGroup(isNextKey ? 1 : -1);
            } else {
                this.cycleNavGroups(isNextKey ? 1 : -1);
            }
        }
    }

    isTypingContext() {
        const active = document.activeElement;
        if (!active) return false;
        if (active.closest("dialog")) return true;
        if (active.isContentEditable) return true;
        const tag = active.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    getNavGroups() {
        return Array.from(document.querySelectorAll("#topnav .nav-group"));
    }

    getUnlockedButtons(group) {
        if (!group) return [];
        return Array.from(group.querySelectorAll("[data-loc='main'][data-panel]"))
            .filter((button) => !button.classList.contains("locked"));
    }

    cycleNavGroups(direction) {
        const groups = this.getNavGroups();
        if (!groups.length) return;

        const currentButton = document.querySelector("#topnav .nav-group [data-loc='main'].chosen");
        const currentGroup = currentButton?.closest(".nav-group");
        let idx = Math.max(0, groups.indexOf(currentGroup));

        for (let i = 0; i < groups.length; i++) {
            idx = (idx + direction + groups.length) % groups.length;
            const unlocked = this.getUnlockedButtons(groups[idx]);
            if (unlocked.length) {
                const next = unlocked[0];
                this.show("main", next.dataset.panel);
                next.focus({preventScroll: true});
                return;
            }
        }
    }

    cycleWithinCurrentGroup(direction) {
        const chosen = document.querySelector("#topnav .nav-group [data-loc='main'].chosen");
        const group = chosen?.closest(".nav-group");
        const unlocked = this.getUnlockedButtons(group);
        if (!unlocked.length) return;

        const currentIndex = Math.max(0, unlocked.indexOf(chosen));
        const nextIndex = (currentIndex + direction + unlocked.length) % unlocked.length;
        const next = unlocked[nextIndex];
        this.show("main", next.dataset.panel);
        next.focus({preventScroll: true});
    }

    setupMobileTopNavPager() {
        const groups = this.mobileNavViewport
            ? Array.from(this.mobileNavViewport.querySelectorAll(".nav-group"))
            : [];
        if (!this.topnav || !groups.length || !this.mobileNavPrev || !this.mobileNavNext) return;

        this.mobileNavGroupIndex = Math.min(1, groups.length - 1);

        const applyPagerState = () => {
            const isMobile = this.isMobileLayout();
            const maxIndex = groups.length - 1;
            const fallbackIndex = Math.min(1, maxIndex);
            const nextIndex = isMobile
                ? Math.max(0, Math.min(maxIndex, this.mobileNavGroupIndex ?? fallbackIndex))
                : fallbackIndex;

            this.mobileNavGroupIndex = nextIndex;
            groups.forEach((group, index) => {
                group.classList.toggle("mobile-nav-active", index === nextIndex);
            });
            this.mobileNavPrev.disabled = !isMobile || nextIndex <= 0;
            this.mobileNavNext.disabled = !isMobile || nextIndex >= maxIndex;
        };

        this.syncMobileTopNavPager = applyPagerState;

        this.mobileNavPrev.addEventListener("pointerdown", (e) => {
            if (!this.isMobileLayout()) return;
            e.preventDefault();
            this.mobileNavGroupIndex = Math.max(0, (this.mobileNavGroupIndex ?? 1) - 1);
            applyPagerState();
        });

        this.mobileNavNext.addEventListener("pointerdown", (e) => {
            if (!this.isMobileLayout()) return;
            e.preventDefault();
            this.mobileNavGroupIndex = Math.min(groups.length - 1, (this.mobileNavGroupIndex ?? 1) + 1);
            applyPagerState();
        });

        const syncAll = () => {
            applyPagerState();
        };

        window.addEventListener("resize", syncAll);
        syncAll();
    }

    focusMobileNavGroupFor(button) {
        if (!button || !this.mobileNavViewport || !this.isMobileLayout()) return;
        const group = button.closest(".nav-group");
        if (!group) return;
        const groups = Array.from(this.mobileNavViewport.querySelectorAll(".nav-group"));
        const nextIndex = groups.indexOf(group);
        if (nextIndex < 0) return;
        this.mobileNavGroupIndex = nextIndex;
        this.syncMobileTopNavPager?.();
    }

    syncInfoBoxesForActivePanel(loc, panel) {
        const panelVisible = this.isPanelVisible(loc, panel);
        document.querySelectorAll(".infobox").forEach((box) => {
            if (box.dataset.infoboxLoc !== loc) return;
            const isTargetPanel = box.dataset.infoboxPanel === panel;
            box._setSuspended?.(!(isTargetPanel && panelVisible));
        });
    }

    syncInfoBoxesForActivePanels(activePanels = this.activePanels) {
        Object.entries(activePanels).forEach(([loc, panel]) => {
            this.syncInfoBoxesForActivePanel(loc, panel);
        });
    }

    notifyPanelVisibilityChange(change) {
        for (const panel of Object.values(this.panels || {})) {
            if (!panel) continue;
            if (typeof panel.onVisibilityChange === "function") {
                panel.onVisibilityChange({
                    activePanels: this.activePanels,
                    change
                });
                continue;
            }
            if (typeof panel.updateVisibility === "function") {
                panel.updateVisibility(change.loc, change.panel);
            }
        }
    }

    show(loc, panel, options = {}) {
        const { force = false } = options;
        if (!(loc in this.activePanels) || !panel) return;
        if (loc === "ledger" && !this.isLedgerVisible()) return;
        if (!force && this.activePanels[loc] === panel) return;

        this.contextMenuService?.destroyMenu?.();
        this.tooltipService?.cleanupAllTooltips?.();

        this.activePanels[loc] = panel;
        this.notifyPanelVisibilityChange({ loc, panel, reason: "show" });
        this.syncInfoBoxesForActivePanels();

        document.querySelectorAll(`[data-loc='${loc}'].chosen`).forEach(el => el.classList.remove("chosen"));
        const buttons = document.querySelectorAll(`[data-loc='${loc}'][data-panel='${panel}']`);
        buttons.forEach((button) => {
            button.classList.add("chosen");
            if (loc === "main") {
                this.focusMobileNavGroupFor(button);
            }
        });

        this.updateMobileNavArrows();

        if (!force) {
            const wrapper = loc === "main" ? this.mainPanel : this.ledger;
            this.playPanelSwapCue(wrapper);
        }
    }

    playPanelSwapCue(wrapper) {
        if (!wrapper) return;

        const cls = "panel-swap-cue";
        wrapper.classList.remove(cls);
        void wrapper.offsetWidth;
        wrapper.classList.add(cls);

        const done = () => {
            wrapper.classList.remove(cls);
        };
        const onEnd = (e) => {
            if (e.target === wrapper) done();
        };
        wrapper.addEventListener("animationend", onEnd);
        setTimeout(() => {
            wrapper.removeEventListener("animationend", onEnd);
            done();
        }, 400);
    }

    isMobileLayout() {
        return this.mobileLayoutQuery.matches;
    }

    isLedgerVisible() {
        return this.ledgerVisibleQuery.matches;
    }

    isPanelVisible(loc, panel) {
        if (!(loc in this.activePanels) || !panel) return false;
        if (loc === "ledger" && !this.isLedgerVisible()) return false;
        return this.activePanels[loc] === panel;
    }

    syncLedgerVisibilityState() {
        const ledgerVisible = this.isLedgerVisible();
        if (!ledgerVisible) {
            document.querySelectorAll("[data-loc='ledger'].chosen").forEach((el) => el.classList.remove("chosen"));
            this.ledger?.querySelectorAll(".panel.shown").forEach((panelEl) => panelEl.classList.remove("shown"));
        } else {
            const activeLedgerPanel = this.activePanels.ledger;
            document.querySelectorAll(`[data-loc='ledger'][data-panel='${activeLedgerPanel}']`)
                .forEach((el) => el.classList.add("chosen"));
            this.ledger?.querySelectorAll(".panel").forEach((panelEl) => {
                panelEl.classList.toggle("shown", panelEl.id === activeLedgerPanel);
            });
        }
        this.notifyPanelVisibilityChange({
            loc: "ledger",
            panel: this.activePanels.ledger,
            reason: "ledger-visibility"
        });
        this.syncInfoBoxesForActivePanels();
    }

    showPanels() {
        Object.entries(this.activePanels).forEach(([loc, panel]) => {
            this.show(loc, panel, { force: true });
        });
    }

    shellSettle() {
        document.body.classList.add('shell-settling');
        setTimeout(() => document.body.classList.remove('shell-settling'), 900);
    }

    createRenderInterval(fn) {
        const id = ++this.renderLoopSeed;
        this.renderLoops.set(id, {
            id,
            fn,
            lastRun: 0,
            intervalMs: this.core.settings.refreshUI
        });
        this.ensureRenderDriver();
        return id;
    }

    destroyRenderInterval(interval) {
        this.renderLoops.delete(interval);
        if (this.renderLoops.size === 0 && this.renderDriverId !== null) {
            cancelAnimationFrame(this.renderDriverId);
            this.renderDriverId = null;
        }
    }

    ensureRenderDriver() {
        if (this.renderDriverId !== null) return;
        const tick = (now) => {
            this.renderLoops.forEach((loop) => {
                if (now - loop.lastRun < loop.intervalMs) return;
                loop.lastRun = now;
                loop.fn();
            });
            this.renderDriverId = this.renderLoops.size
                ? requestAnimationFrame(tick)
                : null;
        };
        this.renderDriverId = requestAnimationFrame(tick);
    }

    initNavButtonFocusability() {
        const updateFocusability = (navButton) => {
            navButton.tabIndex = navButton.classList.contains('locked') ? -1 : 0;
        };

        document.querySelectorAll('.navbutton').forEach(updateFocusability);

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('navbutton')) updateFocusability(target);
                }
            });
        });

        document.querySelectorAll('.navbutton').forEach(button => {
            observer.observe(button, { attributes: true, attributeFilter: ['class'] });
        });
    }

    updateRenderIntervals() {
        this.renderLoops.forEach((loop) => {
            loop.intervalMs = this.core.settings.refreshUI;
        });
    }

    formatNumber(val, opt = {}) {
        return baseFormatNumber(val, this.core.settings.configs.numformat, opt);
    }

    serialize() {
        return {activePanels: this.activePanels};
    }

    deserialize(data) {
        const incoming = data.activePanels || {};
        const validMain = ["industry", "hero", "team", "equipment", "augment", "upgrade",
                           "city", "research", "dungeon", "trade", "army", "tournament", "news",
                           "chart", "achievements", "codex", "settings"];
        const validLedger = ["log", "crew", "kingdom"];

        this.activePanels = {
            main: validMain.includes(incoming.main) ? incoming.main : "industry",
            ledger: validLedger.includes(incoming.ledger) ? incoming.ledger : "log"
        };

    }

    updateMobileNavArrows() {
        this.syncMobileTopNavPager?.();
    }

    hookTip(el, tipKey) {
        if (!el || !tipKey) return;
        const tips = (el.dataset.tips || '').split('@').filter(Boolean);
        if (!tips.includes(tipKey)) {
            tips.push(tipKey);
            el.dataset.tips = tips.join('@');
            el.classList.add('hastip');
        }
    }

    unhookTip(el, tipKey) {
        if (!el || !tipKey) return;
        const tips = el.dataset.tips?.split('@').filter(t => t && t !== tipKey);
        if (tips?.length) {
            el.dataset.tips = tips.join('@');
        } else {
            delete el.dataset.tips;
            el.classList.remove('hastip');
        }
    }

    refreshTip(el) {
        this.tooltipService?.immediateRefresh(el);
    }

    hookMenu(el, id) {
        this.contextMenuService?.hookMenu(el, id);
    }

    unhookMenu(el) {
        this.contextMenuService?.unhookMenu(el);
    }
}
