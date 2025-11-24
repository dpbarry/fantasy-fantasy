export default function createInfoBox(targetElement, message, options = {}) {
    const box = document.createElement('div');
    box.className = 'infobox';
    if (options.id) {
        box.dataset.infoboxId = options.id;
    }
    box.style.opacity = '0';
    
    const content = document.createElement('div');
    content.className = 'infobox-content';
    content.innerHTML = message;
    
    const dismissNote = document.createElement('div');
    dismissNote.className = 'infobox-dismiss';
    dismissNote.textContent = 'click to dismiss';
    
    box.appendChild(content);
    box.appendChild(dismissNote);
    document.body.appendChild(box);
    
    const PADDING = 8;
    const MARGIN = 3;
    
    let currentPos = null;
    
    function positionBox() {
        const targetRect = targetElement.getBoundingClientRect();
        const boxRect = box.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        
        const space = {
            above: targetRect.top,
            below: vh - targetRect.bottom,
            left: targetRect.left,
            right: vw - targetRect.right,
        };
        const horizontalBuffer = Math.max(0, (boxRect.width - targetRect.width) / 2);
        const canCenterHorizontally =
            (targetRect.left - horizontalBuffer) >= PADDING &&
            (targetRect.right + horizontalBuffer) <= (vw - PADDING);
        
        const order = (() => {
            const base = ['above', 'below', 'left', 'right'];
            if (!options.preferredPosition) return base;
            return [options.preferredPosition, ...base.filter(p => p !== options.preferredPosition)];
        })();
        
        const fits = (pos) => {
            switch (pos) {
                case 'above':
                    return space.above >= boxRect.height + PADDING && canCenterHorizontally;
                case 'below':
                    return space.below >= boxRect.height + PADDING && canCenterHorizontally;
                case 'left':
                    return (targetRect.left - boxRect.width - MARGIN) >= PADDING;
                case 'right':
                    return (targetRect.right + boxRect.width + MARGIN) <= (vw - PADDING);
                default:
                    return false;
            }
        };
        
        let pos = order.find(fits);
        if (!pos) pos = 'above';
        
        if (currentPos !== pos) {
            if (currentPos !== null) {
                box.classList.remove(`infobox-${currentPos}`);
            }
            box.classList.add(`infobox-${pos}`);
            currentPos = pos;
        }
        
        let top, left;
        switch (pos) {
            case 'above':
                top = targetRect.top - boxRect.height - MARGIN;
                left = targetRect.left + (targetRect.width - boxRect.width) / 2;
                break;
            case 'below':
                top = targetRect.bottom + MARGIN;
                left = targetRect.left + (targetRect.width - boxRect.width) / 2;
                break;
            case 'left':
                top = targetRect.top + (targetRect.height - boxRect.height) / 2;
                left = targetRect.left - boxRect.width - MARGIN;
                break;
            case 'right':
                top = targetRect.top + (targetRect.height - boxRect.height) / 2;
                left = targetRect.right + MARGIN;
                break;
        }
        
        left = Math.max(PADDING, Math.min(left, vw - boxRect.width - PADDING));
        top = Math.max(PADDING, Math.min(top, vh - boxRect.height - PADDING));
        
        box.style.top = `${top}px`;
        box.style.left = `${left}px`;
    }
    
    positionBox();
    
    requestAnimationFrame(() => {
        box.style.transition = 'opacity 0.15s';
        box.style.opacity = '1';
    });
    
    const resizeObserver = new ResizeObserver(() => {
        positionBox();
    });
    resizeObserver.observe(box);
    resizeObserver.observe(targetElement);
    
    const scrollHandler = () => {
        positionBox();
    };
    window.addEventListener('scroll', scrollHandler, true);
    window.addEventListener('resize', scrollHandler);
    
    let dismissed = false;
    let updateInterval = null;
    
    if (options.updateFn) {
        box._updateFn = options.updateFn;
        box._positionBox = positionBox;
        const updaterFn = () => {
            if (dismissed || !box.parentElement) {
                if (updateInterval && options.destroyRenderInterval) {
                    options.destroyRenderInterval(updateInterval);
                } else if (updateInterval) {
                    clearInterval(updateInterval);
                }
                return;
            }
            const newMessage = options.updateFn();
            if (newMessage) {
                const oldContent = content.innerHTML;
                content.innerHTML = newMessage;
                if (oldContent !== newMessage) {
                    positionBox();
                }
            }
        };
        
        if (options.createRenderInterval) {
            updateInterval = options.createRenderInterval(updaterFn);
        } else {
            updateInterval = setInterval(updaterFn, 250);
        }
        box._updateInterval = updateInterval;
    }
    
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        
        if (updateInterval) {
            if (options.destroyRenderInterval) {
                options.destroyRenderInterval(updateInterval);
            } else {
                clearInterval(updateInterval);
            }
            updateInterval = null;
        }
        
        resizeObserver.disconnect();
        window.removeEventListener('scroll', scrollHandler, true);
        window.removeEventListener('resize', scrollHandler);
        
        box.style.transition = 'opacity 0.2s, transform 0.2s';
        box.style.opacity = '0';
        box.style.transform = 'translateY(0.5em)';
        
        setTimeout(() => {
            if (box.parentElement) {
                box.remove();
            }
        }, 200);
        
        if (options.onDismiss) {
            options.onDismiss();
        }
    };
    
    box.addEventListener('click', dismiss);
    box._dismiss = dismiss;
    
    const updateMessage = (newMessage) => {
        content.innerHTML = newMessage;
        positionBox();
    };
    box._updateMessage = updateMessage;
    
    return {
        dismiss,
        updateMessage,
        element: box
    };
}

