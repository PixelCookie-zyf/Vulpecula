export type StylePreset = {
  id: string;
  name: string;
  hint: string;
  prompt: string;
};

export const defaultStylePresets: StylePreset[] = [
  {
    id: "isometric",
    name: "Isometric Game Art",
    hint: "Default · the studio look",
    prompt:
      "45° isometric game asset, clean silhouette, soft studio lighting, stylized cohesive game-art visual language, plain background",
  },
  {
    id: "pixel",
    name: "Pixel Art",
    hint: "Crisp retro sprites",
    prompt:
      "crisp pixel art game sprite, limited palette, clean pixel clusters, readable silhouette, retro style",
  },
  {
    id: "flat",
    name: "Flat Vector",
    hint: "Bold shapes, minimal shading",
    prompt:
      "flat vector game illustration, bold geometric shapes, solid colors, minimal shading, clean edges",
  },
  {
    id: "handpainted",
    name: "Hand-Painted",
    hint: "Painterly storybook feel",
    prompt:
      "hand-painted stylized game art, painterly brush strokes, warm storybook palette, soft texture detail",
  },
  {
    id: "render3d",
    name: "3D Render",
    hint: "Soft stylized CGI",
    prompt:
      "stylized 3D render game asset, soft global illumination, subtle subsurface scattering, clean material definition",
  },
];

const STYLES_KEY = "vulpecula-styles";

export function readStylePresets(): StylePreset[] {
  try {
    const raw = window.localStorage.getItem(STYLES_KEY);
    if (!raw) return defaultStylePresets;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultStylePresets;
    const presets = parsed
      .filter((entry): entry is Partial<StylePreset> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
        name: typeof entry.name === "string" ? entry.name : "Untitled style",
        hint: typeof entry.hint === "string" ? entry.hint : "",
        prompt: typeof entry.prompt === "string" ? entry.prompt : "",
      }));
    return presets.length > 0 ? presets : defaultStylePresets;
  } catch {
    return defaultStylePresets;
  }
}

export function writeStylePresets(presets: StylePreset[]) {
  try {
    window.localStorage.setItem(STYLES_KEY, JSON.stringify(presets));
  } catch {}
}

export function composeStyledPrompt(userPrompt: string, preset: StylePreset | null): string {
  const fragment = preset?.prompt.trim();
  if (!fragment) return userPrompt;
  return `${userPrompt}, ${fragment}`;
}
