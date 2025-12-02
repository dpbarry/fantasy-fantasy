/**
 * BreakdownBox - Shows effects with their modifiers listed underneath
 */

export default function createBreakdownBox(data) {
    if (!data?.items?.length) return '';

    const items = data.items;
    const mods = data.modifiers || [];

    if (!mods.length) {
        // Sort: drains first, then gains
        const sortedItems = [...items].sort((a, b) => {
            if (a.type === 'drain' && b.type !== 'drain') return -1;
            if (a.type !== 'drain' && b.type === 'drain') return 1;
            return 0;
        });
        const html = sortedItems.map(it => renderItem(it)).join('');
        return `<div class="bd">${html}${renderRes(data.result)}</div>`;
    }

    // For each item, show it with its modifiers underneath
    // Sort items: drains first, then gains
    const sortedItems = [...items].sort((a, b) => {
        if (a.type === 'drain' && b.type !== 'drain') return -1;
        if (a.type !== 'drain' && b.type === 'drain') return 1;
        return 0;
    });

    const html = sortedItems.map((item, index) => {
        // Find applicable modifiers based on original positions
        const originalIndex = items.indexOf(item);
        const applicableMods = mods.filter(mod =>
            originalIndex >= mod.range[0] && originalIndex <= mod.range[1]
        );
        return renderItemWithMods(item, applicableMods);
    }).join('');

    return `<div class="bd">${html}${renderRes(data.result)}</div>`;
}

function renderItemWithMods(item, mods) {
    const cls = item.type === 'gain' ? 'bd-g' : item.type === 'drain' ? 'bd-d' : '';
    const note = item.note ? ` <span class="bd-n">(${item.note})</span>` : '';

    const itemHtml = `<div class="bd-r"><span class="${cls}">${item.value}</span> ${item.label}${note}</div>`;

    if (mods.length === 0) {
        return itemHtml;
    }

    // Show modifiers underneath with indentation - each on its own line
    const modHtml = mods.map(mod => {
        // Format: if value is just "×" and label starts with number, combine them as "×{number}"
        let displayValue = mod.value;
        let displayLabel = mod.label;

        if (mod.value === '×' && /^\d+/.test(mod.label)) {
            const match = mod.label.match(/^(\d+)\s*(.*)$/);
            if (match) {
                displayValue = `×${match[1]}`;
                displayLabel = match[2];
            }
        }

        return `<div class="bd-r-mod">${displayValue} <span class="bd-n">(${displayLabel})</span></div>`;
    }).join('');

    return `<div class="bd-r-group">${itemHtml}${modHtml}</div>`;
}

function renderItem(item) {
    const cls = item.type === 'gain' ? 'bd-g' : item.type === 'drain' ? 'bd-d' : '';
    const note = item.note ? ` <span class="bd-n">(${item.note})</span>` : '';
    return `<div class="bd-r"><span class="${cls}">${item.value}</span> ${item.label}${note}</div>`;
}

function renderRes(r) {
    if (!r?.items?.length) return '';
    // Sort: drains first, then gains
    const sortedItems = [...r.items].sort((a, b) => {
        if (a.type === 'drain' && b.type !== 'drain') return -1;
        if (a.type !== 'drain' && b.type === 'drain') return 1;
        return 0;
    });
    const parts = sortedItems.map(it =>
        `<span class="${it.type === 'gain' ? 'bd-g' : it.type === 'drain' ? 'bd-d' : ''}">${it.value} ${it.label}</span>`
    ).join(', ');
    return `<div class="bd-res">= ${parts}</div>`;
}
