export default function createContextMenuService(core, tooltipService) {
    const menus = new Map();
    let activeMenu = null;
    let activeElement = null;
    const menuShownFromHold = new WeakMap();
    let dismissHandlers = null;

    const SCROLL_ITEM_CAP = 5;
    const MENU_OFFSET_X = 4;
    const MENU_OFFSET_Y = -2;

    function hookMenu(el, key) {
        if (!el || !key) return;
        el.dataset.contextMenu = key;
    }

    function unhookMenu(el) {
        if (!el) return;
        delete el.dataset.contextMenu;
    }

    function resolveMenuHost(target) {
        return target?.closest?.('[data-context-menu]') || null;
    }

    function hasMenu(el) {
        const host = el?.matches?.('[data-context-menu]') ? el : resolveMenuHost(el);
        const key = host?.dataset?.contextMenu;
        return Boolean(key && menus.has(key));
    }

    function getMenuActions(host) {
        if (!host?.dataset?.contextMenu) return [];
        const getActions = menus.get(host.dataset.contextMenu);
        if (!getActions) return [];
        const actions = getActions(host);
        return Array.isArray(actions) ? actions : [];
    }

    function hasTooltip(el) {
        if (!el) return false;
        return el.classList?.contains('hastip') || el.dataset?.tips || el.dataset?.tip || el.dataset?.tip2;
    }

    function getNavItems() {
        const items = [];
        document.querySelectorAll('[data-loc="main"][data-panel]:not(.locked)').forEach((btn) => {
            const panel = btn.dataset.panel;
            if (!panel) return;
            const label = btn.querySelector('img')?.alt || panel.charAt(0).toUpperCase() + panel.slice(1);
            items.push({
                label,
                action: () => {
                    core.ui?.show?.('main', panel);
                    destroyMenu();
                },
            });
        });
        return items;
    }

    function buildAndPlaceMenu(items, x, y, title = null) {
        const root = document.createElement('div');
        root.className = 'context-menu';
        root.style.position = 'fixed';
        root.style.zIndex = '10000';
        root.style.opacity = '0';
        root.style.pointerEvents = 'none';

        if (title) {
            const header = document.createElement('div');
            header.className = 'context-menu-header';
            header.textContent = title;
            root.appendChild(header);
        }

        const list = document.createElement('div');
        list.className = 'context-menu-list';

        items.forEach((item) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'context-menu-item';
            if (item.disabled) itemEl.classList.add('disabled');
            itemEl.textContent = item.label;
            itemEl.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!item.disabled && item.action) item.action();
                destroyMenu();
            });
            list.appendChild(itemEl);
        });

        root.appendChild(list);
        document.body.appendChild(root);

        const itemEls = list.querySelectorAll('.context-menu-item');
        const firstH = itemEls[0]?.getBoundingClientRect().height ?? 0;
        if (items.length > SCROLL_ITEM_CAP && firstH > 0) {
            list.classList.add('context-menu-list--scroll');
            list.style.maxHeight = `${firstH * (SCROLL_ITEM_CAP + 0.5)}px`;
        }

        let finalX = x + MENU_OFFSET_X;
        let finalY = y + MENU_OFFSET_Y;

        const rect = root.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const PADDING = 8;

        if (finalX + rect.width > vw - PADDING) finalX = vw - rect.width - PADDING;
        if (finalX < PADDING) finalX = PADDING;
        if (finalY + rect.height > vh - PADDING) finalY = vh - rect.height - PADDING;
        if (finalY < PADDING) finalY = PADDING;

        root.style.left = `${finalX}px`;
        root.style.top = `${finalY}px`;
        root.style.opacity = '1';
        root.style.pointerEvents = 'auto';

        activeMenu = root;

        const dismiss = (e) => {
            if (e.target && e.target.nodeType === Node.ELEMENT_NODE && !root.contains(e.target)) {
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
    }

    function showMenu(el, x, y, fromHold = false) {
        if (activeMenu) destroyMenu();

        const host = el?.matches?.('[data-context-menu]') ? el : resolveMenuHost(el) || el;
        const actions = getMenuActions(host);
        const hasTip = hasTooltip(host);

        const items = [];
        if (fromHold && hasTip) {
            items.push({
                label: 'See tooltip',
                action: () => {
                    destroyMenu();
                    tooltipService.showTooltip(host);
                },
            });
        }
        items.push(...actions);

        if (items.length === 0) return false;

        activeElement = host;
        if (fromHold) menuShownFromHold.set(host, true);

        buildAndPlaceMenu(items, x, y, null);
        return true;
    }

    function showBackgroundMenu(x, y) {
        if (activeMenu) destroyMenu();

        const items = getNavItems();
        if (items.length === 0) return false;

        buildAndPlaceMenu(items, x, y, 'Go to');
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
    }

    function handleRightClick(e) {
        if (e.button !== 2) return;

        e.preventDefault();
        e.stopPropagation();

        const menuHost = e.target.closest('[data-context-menu]');
        if (menuHost?.dataset?.contextMenu && menus.has(menuHost.dataset.contextMenu)) {
            const acts = getMenuActions(menuHost);
            if (acts.length > 0) {
                showMenu(menuHost, e.clientX, e.clientY, false);
                return;
            }
        }

        showBackgroundMenu(e.clientX, e.clientY);
    }

    function handleHold(el, x, y) {
        const host = el?.matches?.('[data-context-menu]') ? el : resolveMenuHost(el) || el;
        if (hasMenu(host) && getMenuActions(host).length > 0) {
            return showMenu(host, x, y, true);
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

        const isBackground = !target.closest(
            'button, a, input, select, textarea, [role="button"], .hastip, [data-context-menu]'
        );
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
        hookMenu,
        unhookMenu,
        hasMenu,
        showMenu,
        showBackgroundMenu,
        destroyMenu,
        handleHold,
        wasShownFromHold,
        clearHoldFlag,
    };
}
