export default function createContextMenuService(core, tooltipService) {
    const menus = new Map();
    let activeMenu = null;
    let activeElement = null;
    let pendingMenu = null;
    const menuShownFromHold = new WeakMap();
    let dismissHandlers = null;

    const PANEL_SHORTCUTS = [
        { loc: 'center', panel: 'story', label: 'Story' },
        { loc: 'center', panel: 'industry', label: 'Industry' },
        { loc: 'center', panel: 'research', label: 'Research' },
        { loc: 'right', panel: 'news', label: 'News' },
        { loc: 'right', panel: 'settings', label: 'Settings' },
    ];

    function registerMenu(selector, getActions) {
        menus.set(selector, getActions);
    }

    function hasMenu(el) {
        if (!el) return false;
        for (const [selector, _] of menus.entries()) {
            if (el.matches && el.matches(selector)) return true;
            if (el.closest && el.closest(selector)) return true;
        }
        return el.dataset?.contextMenu !== undefined;
    }

    function getMenuActions(el) {
        if (!el) return [];
        
        const actions = [];
        
        for (const [selector, getActions] of menus.entries()) {
            const match = el.matches && el.matches(selector) ? el : (el.closest && el.closest(selector));
            if (match) {
                const menuActions = getActions(match);
                if (Array.isArray(menuActions)) {
                    actions.push(...menuActions);
                }
            }
        }
        
        if (el.dataset?.contextMenu) {
            const menuId = el.dataset.contextMenu;
            const getActions = menus.get(`[data-context-menu="${menuId}"]`);
            if (getActions) {
                const menuActions = getActions(el);
                if (Array.isArray(menuActions)) {
                    actions.push(...menuActions);
                }
            }
        }
        
        return actions;
    }

    function hasTooltip(el) {
        if (!el) return false;
        return el.classList?.contains('hastip') || el.dataset?.tip || el.dataset?.tip2;
    }

    function showMenu(el, x, y, fromHold = false) {
        if (activeMenu) {
            destroyMenu();
        }

        const actions = getMenuActions(el);
        const hasTip = hasTooltip(el);
        
        const items = [];
        
        if (fromHold && hasTip) {
            items.push({
                label: 'See tooltip',
                action: () => {
                    destroyMenu();
                    tooltipService.showTooltip(el);
                }
            });
        }
        
        items.push(...actions);

        if (items.length === 0) {
            return false;
        }

        activeElement = el;
        if (fromHold) {
            menuShownFromHold.set(el, true);
        }
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.zIndex = '10000';
        menu.style.opacity = '0';
        menu.style.pointerEvents = 'none';

        items.forEach((item,) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            if (item.disabled) {
                itemEl.classList.add('disabled');
            }
            itemEl.textContent = item.label;
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!item.disabled && item.action) {
                    item.action();
                }
                destroyMenu();
            });
            menu.appendChild(itemEl);
        });

        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const PADDING = 8;

        let finalX = x;
        let finalY = y;

        if (finalX + rect.width > vw - PADDING) {
            finalX = vw - rect.width - PADDING;
        }
        if (finalX < PADDING) {
            finalX = PADDING;
        }
        if (finalY + rect.height > vh - PADDING) {
            finalY = vh - rect.height - PADDING;
        }
        if (finalY < PADDING) {
            finalY = PADDING;
        }

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';

        activeMenu = menu;

        const dismiss = (e) => {
            if (e.target && e.target.nodeType === Node.ELEMENT_NODE && !menu.contains(e.target)) {
                destroyMenu();
            } else if (!e.target) {
                destroyMenu();
            }
        };

        dismissHandlers = { dismiss };
        setTimeout(() => {
            document.addEventListener('pointerdown', dismiss);
            document.addEventListener('scroll', dismiss, true);
            window.addEventListener('resize', dismiss);
        }, 0);

        return true;
    }

    function showBackgroundMenu(x, y) {
        if (activeMenu) {
            destroyMenu();
        }

        const items = PANEL_SHORTCUTS.map(({ loc, panel, label }) => ({
            label,
            action: () => {
                if (core.ui && core.ui.show) {
                    core.ui.show(loc, panel);
                }
                destroyMenu();
            }
        }));

        if (items.length === 0) return false;

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.zIndex = '10000';
        menu.style.opacity = '0';
        menu.style.pointerEvents = 'none';

        items.forEach((item) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            itemEl.textContent = item.label;
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.action) {
                    item.action();
                }
                destroyMenu();
            });
            menu.appendChild(itemEl);
        });

        document.body.appendChild(menu);

        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const PADDING = 8;

        let finalX = x;
        let finalY = y;

        if (finalX + rect.width > vw - PADDING) {
            finalX = vw - rect.width - PADDING;
        }
        if (finalX < PADDING) {
            finalX = PADDING;
        }
        if (finalY + rect.height > vh - PADDING) {
            finalY = vh - rect.height - PADDING;
        }
        if (finalY < PADDING) {
            finalY = PADDING;
        }

        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
        menu.style.opacity = '1';
        menu.style.pointerEvents = 'auto';

        activeMenu = menu;

        const dismiss = (e) => {
            if (e.target && e.target.nodeType === Node.ELEMENT_NODE && !menu.contains(e.target)) {
                destroyMenu();
            } else if (!e.target) {
                destroyMenu();
            }
        };

        dismissHandlers = { dismiss };
        setTimeout(() => {
            document.addEventListener('pointerdown', dismiss);
            document.addEventListener('scroll', dismiss, true);
            window.addEventListener('resize', dismiss);
        }, 0);

        return true;
    }

    function destroyMenu() {
        if (dismissHandlers) {
            const { dismiss } = dismissHandlers;
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
            dismissHandlers = null;
        }
        
        if (activeMenu) {
            activeMenu.remove();
            activeMenu = null;
        }
        if (activeElement) {
            menuShownFromHold.delete(activeElement);
        }
        activeElement = null;
        pendingMenu = null;
    }

    function handleRightClick(e) {
        if (e.button !== 2) return;
        
        e.preventDefault();
        e.stopPropagation();

        const el = e.target.closest('[data-context-menu], button, a, [role="button"]') || e.target;
        
        if (hasMenu(el)) {
            const rect = el.getBoundingClientRect();
            showMenu(el, rect.left + rect.width / 2, rect.top + rect.height / 2, false);
        } else {
            showBackgroundMenu(e.clientX, e.clientY);
        }
    }

    function handleHold(el, x, y) {
        if (hasMenu(el)) {
            showMenu(el, x, y, true);
            return true;
        }
        return false;
    }
    
    function wasShownFromHold(el) {
        return menuShownFromHold.get(el) || false;
    }
    
    function clearHoldFlag(el) {
        menuShownFromHold.delete(el);
    }

    let backgroundHoldTimeout = null;
    let backgroundHoldTarget = null;
    
    function handleBackgroundHold(e) {
        if (e.pointerType === 'mouse') return;
        
        const target = e.target;
        const hasTooltipOrMenu = target.closest('.hastip, [data-context-menu], button, a, [role="button"]');
        if (hasTooltipOrMenu) return;
        
        const isBackground = !target.closest('button, a, input, select, textarea, [role="button"], .hastip, [data-context-menu]');
        if (!isBackground) return;
        
        backgroundHoldTarget = { x: e.clientX, y: e.clientY };
        
        if (backgroundHoldTimeout) clearTimeout(backgroundHoldTimeout);
        
        backgroundHoldTimeout = setTimeout(() => {
            if (backgroundHoldTarget) {
                showBackgroundMenu(backgroundHoldTarget.x, backgroundHoldTarget.y);
                backgroundHoldTarget = null;
            }
        }, 350);
        
        const cancel = () => {
            if (backgroundHoldTimeout) {
                clearTimeout(backgroundHoldTimeout);
                backgroundHoldTimeout = null;
            }
            backgroundHoldTarget = null;
            document.removeEventListener('pointerup', cancel);
            document.removeEventListener('pointercancel', cancel);
        };
        
        document.addEventListener('pointerup', cancel, { once: true });
        document.addEventListener('pointercancel', cancel, { once: true });
    }

    document.addEventListener('contextmenu', handleRightClick);
    document.addEventListener('pointerdown', handleBackgroundHold, true);

    return {
        registerMenu,
        hasMenu,
        showMenu,
        showBackgroundMenu,
        destroyMenu,
        handleHold,
        wasShownFromHold,
        clearHoldFlag,
    };
}

