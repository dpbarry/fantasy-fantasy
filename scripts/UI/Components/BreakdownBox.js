export default function createBreakdownBox(data) {
    if (!data) return '';

    if (data.header && !data.items) {
        return `<div class="bd"><p>${data.header}</p></div>`;
    }

    const parts = [];

    if (data.header) {
        parts.push(`<p>${data.header}</p>`);
    }

    if (data.items?.length) {
        parts.push(data.items.map(item => renderItem(item)).join(''));
    }

    if (data.result) {
        parts.push(renderResult(data.result));
    }

    if (data.footer) {
        parts.push(`<p>${data.footer}</p>`);
    }

    if (parts.length === 0) return '';

    return `<div class="bd">${parts.join('')}</div>`;
}

function renderItem(item) {
    const cls = item.type === 'gain' ? 'bd-g' : item.type === 'drain' ? 'bd-d' : '';
    const note = item.note ? ` <span class="bd-n">(${item.note})</span>` : '';
    const itemHtml = `<div class="bd-r"><span class="${cls}">${item.value}</span> ${item.label}${note}</div>`;

    if (item.modifiers?.length) {
        const modHtml = item.modifiers.map(mod => {
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

    return itemHtml;
}

function renderResult(result) {
    if (!result) return '';
    if (Array.isArray(result.items)) {
        const parts = result.items.map(it => {
            const cls = it.type === 'gain' ? 'bd-g' : it.type === 'drain' ? 'bd-d' : '';
            return `<span class="${cls}">${it.value} ${it.label || ''}</span>`;
        }).join(', ');
        return `<div class="bd-res">= ${parts}</div>`;
    }
    const cls = result.type === 'gain' ? 'bd-g' : result.type === 'drain' ? 'bd-d' : '';
    return `<div class="bd-res">= <span class="${cls}">${result.value}</span> ${result.label || ''}</div>`;
}
