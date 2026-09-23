const saved = localStorage.getItem("dashboardTheme");
if (saved) document.documentElement.setAttribute("data-theme", saved);
