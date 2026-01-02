export default function createModalDialog(dialogElementOrHtml) {
    let dialog;
    let closeDialogFunction = null;
    let previouslyFocusedElement = null;
    let clickOutsideHandler = null;

    if (typeof dialogElementOrHtml === 'string') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = dialogElementOrHtml.trim();
        dialog = tempDiv.firstElementChild;
        dialog.style.display = "none";
        document.body.appendChild(dialog);
    } else {
        dialog = dialogElementOrHtml;
    }

    function handleClickOutside(e) {
        if (e.target.closest('select') || e.target.closest('.select')) return;

        const rect = dialog.getBoundingClientRect();
        const clickedInDialog = (
            rect.top <= e.clientY &&
            e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX &&
            e.clientX <= rect.left + rect.width
        );

        if (!clickedInDialog) {
            close();
        }
    }

    async function handleDialogClose() {
            if (clickOutsideHandler) {
            document.removeEventListener('click', clickOutsideHandler);
            clickOutsideHandler = null;
        }

        dialog.style.display = "none";
        closeDialogFunction = null;

        const restoreFocus = async () => {
            if (previouslyFocusedElement &&
                previouslyFocusedElement.focus &&
                document.body.contains(previouslyFocusedElement) &&
                !document.activeElement?.closest('dialog')) {


                const isMobile = window.matchMedia('(width <= 950px)').matches;
                if (isMobile) {
                    const activeSection = document.querySelector('.main-section.active');
                    if (activeSection && !activeSection.contains(previouslyFocusedElement)) {
                        return false;
                    }
                }


                previouslyFocusedElement.focus({ preventScroll: true });
                previouslyFocusedElement.blur();
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        previouslyFocusedElement.focus({ preventScroll: true });
                        resolve();
                    });
                });

                return true;
            }
            return false;
        };

        await restoreFocus();
        document.dispatchEvent(new Event('dialogResolved'));
        dialog.onclose = null;
    }

    function open() {
        if (closeDialogFunction) return closeDialogFunction;

        previouslyFocusedElement = document.activeElement;
        dialog.showModal();
        dialog.style.display = "";

        let ignoreClick = true;
        setTimeout(() => { ignoreClick = false; }, 250);

        clickOutsideHandler = (e) => {
            if (ignoreClick) return;
            handleClickOutside(e);
        };

        document.addEventListener('click', clickOutsideHandler);

        closeDialogFunction = async () => {
            if (!closeDialogFunction) return;

            if (clickOutsideHandler) {
                document.removeEventListener('click', clickOutsideHandler);
                clickOutsideHandler = null;
            }
            await dialog.close();
            dialog.style.display = "none";
            closeDialogFunction = null;
            return Promise.resolve();
        };

        dialog.onclose = handleDialogClose;

        return closeDialogFunction;
    }

    async function close() {
        if (closeDialogFunction) {
            await closeDialogFunction();
        }
    }

    function destroy() {
        if (closeDialogFunction) {
            close();
        }
        if (dialog && dialog.parentElement) {
            dialog.remove();
        }
    }

    return {
        dialog,
        open,
        close,
        destroy,
        get isOpen() {
            return closeDialogFunction !== null;
        }
    };
}
