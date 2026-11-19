export const THEMES = [
  { id: "blossom", name: "Blossom", swatch: ["#d9638b", "#fce4ec", "#f6a5c0"] },
  { id: "sage", name: "Sage", swatch: ["#5f8f6b", "#e3f0e5", "#a8cdb0"] },
  { id: "lavender", name: "Lavender", swatch: ["#8068c9", "#ece6fa", "#b9a7ee"] },
  { id: "apricot", name: "Apricot", swatch: ["#e07b39", "#fdebdc", "#f5b98a"] },
  { id: "ocean", name: "Ocean", swatch: ["#2f7fb8", "#e1f0fa", "#8cc4e8"] },
  { id: "berry", name: "Berry", swatch: ["#a3306b", "#f8e1ee", "#d98ab5"] },
] as const;

export const THEME_IDS = THEMES.map((t) => t.id) as string[];
export const COLOR_MODES = ["system", "light", "dark"] as const;
