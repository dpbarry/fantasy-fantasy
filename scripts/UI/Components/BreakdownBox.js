
export default function createBreakdownBox(data) {
    if (!data) return '';

    // Handle simple text-only case (e.g., disabled reasons)
    if (data.header && !data.items && !data.costs && !data.capChanges) {
        return `<div class="bd"><p>${data.header}</p></div>`;
    }

    const parts = [];

    // Header text
    if (data.header) {
        parts.push(`<p>${data.header}</p>`);
    }

    // Costs section (one-time resource drains)
    if (data.costs?.length) {
        const costsHtml = data.costs.map(c => renderItem(c)).join('');
        parts.push(costsHtml);
    }

    // Effects section (ongoing gains/drains)
    if (data.items?.length) {
        const items = data.items;
        const mods = data.modifiers || [];

        if (!mods.length) {
            const sortedItems = [...items].sort((a, b) => {
                if (a.type === 'drain' && b.type !== 'drain') return -1;
                if (a.type !== 'drain' && b.type === 'drain') return 1;
                return 0;
            });
            parts.push(sortedItems.map(it => renderItem(it)).join(''));
        } else {
            const sortedItems = [...items].sort((a, b) => {
                if (a.type === 'drain' && b.type !== 'drain') return -1;
                if (a.type !== 'drain' && b.type === 'drain') return 1;
                return 0;
            });

            const html = sortedItems.map((item) => {
                const originalIndex = items.indexOf(item);
                const applicableMods = mods.filter(mod =>
                    originalIndex >= mod.range[0] && originalIndex <= mod.range[1]
                );
                return renderItemWithMods(item, applicableMods);
            }).join('');
            parts.push(html);
        }
    }

    // Cap changes section
    if (data.capChanges?.length) {
        const capHtml = data.capChanges.map(c => renderItem(c)).join('');
        parts.push(capHtml);
    }

    // Result section
    if (data.result) {
        parts.push(renderRes(data.result));
    }

    // Footer text
    if (data.footer) {
        parts.push(`<p>${data.footer}</p>`);
    }

    if (parts.length === 0) return '';

    return `<div class="bd">${parts.join('')}</div>`;
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
        `<span class="${it.type === 'gain' ? 'bd-g' : it.type === 'drain' ? 'bd-d' : ''}">${it.value} ${it.label ? it.label : ''}</span>`
    ).join(', ');
    return `<div class="bd-res">= ${parts}</div>`;
}
