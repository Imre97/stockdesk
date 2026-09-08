(function () {
  var STORAGE_KEY = "stockdesk.settings";
  var DARK_CLASS = "dark";
  var DARK_QUERY = "(prefers-color-scheme: dark)";

  function readTheme() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (typeof raw !== "string") return "system";
      var parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object") return "system";
      var theme = parsed.theme;
      if (theme === "light" || theme === "dark" || theme === "system") return theme;
      return "system";
    } catch (_error) {
      return "system";
    }
  }

  function prefersDark() {
    try {
      if (typeof window.matchMedia !== "function") return false;
      return window.matchMedia(DARK_QUERY).matches === true;
    } catch (_error) {
      return false;
    }
  }

  var theme = readTheme();
  var dark = theme === "dark" || (theme === "system" && prefersDark());

  document.documentElement.classList.toggle(DARK_CLASS, dark);
})();
