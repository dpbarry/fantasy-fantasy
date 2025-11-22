export default function createInfoBox(targetElement, message, options = {}) {
    const box = document.createElement('div');
    box.className = 'infobox';
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
        
        let pos;
        if (space.above >= boxRect.height + PADDING && space.left + targetRect.width >= boxRect.width) {
            pos = 'above';
        } else if (space.below >= boxRect.height + PADDING && space.left + targetRect.width >= boxRect.width) {
            pos = 'below';
        } else if (space.left >= boxRect.width + PADDING) {
            pos = 'left';
        } else if (space.right >= boxRect.width + PADDING) {
            pos = 'right';
        } else {
            pos = 'above';
        }
        
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
    
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        
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
    
    return {
        dismiss,
        element: box
    };
}

