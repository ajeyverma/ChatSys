/**
 * ChatSys Theme Manager
 * Shared across Launcher, Client, and Server views.
 */
(function () {
    const STORAGE_KEY = 'chatsys-theme';
    const THEMES = ['default', 'light', 'dark'];

    function applyTheme(theme) {
        document.body.classList.add('theme-transitioning');

        const html = document.documentElement;
        if (theme === 'default') {
            html.removeAttribute('data-theme');
            // If system is dark, we might want to manually apply dark base to body if needed
        } else {
            html.setAttribute('data-theme', theme);
        }

        localStorage.setItem(STORAGE_KEY, theme);

        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 300);
    }

    function init() {
        const savedTheme = localStorage.getItem(STORAGE_KEY) || 'default';
        applyTheme(savedTheme);
    }

    // Export to global scope
    window.ThemeManager = {
        apply: applyTheme,
        init: init,
        getCurrent: () => localStorage.getItem(STORAGE_KEY) || 'default'
    };

    // Auto-init on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
