const dark = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => {
  const saved = localStorage.getItem("dashboardTheme");
  document.documentElement.classList.toggle(
    "dark",
    saved ? saved === "dark" : dark.matches,
  );
};
applyTheme();
dark.addEventListener("change", applyTheme);
