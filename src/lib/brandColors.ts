/** Cores da marca das empresas: contraste do texto e sugestão a partir do logo. */

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Texto legível sobre a cor: branco nas escuras, grafite nas claras. */
export function inkOn(hex: string): string {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#17181a" : "#ffffff";
}

/**
 * Sugere a cor principal e a de destaque de um logo: as duas cores mais
 * frequentes, sem fundo branco, transparência e cinzas, e bem diferentes entre si.
 */
export async function suggestBrandColors(src: string): Promise<{ brandColor: string; accentColor: string | null } | null> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<string, { n: number; sum: Rgb }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 40) continue; // branco, preto e cinzas
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) ?? { n: 0, sum: [0, 0, 0] };
    bucket.n++;
    bucket.sum = [bucket.sum[0] + r, bucket.sum[1] + g, bucket.sum[2] + b];
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bk) => bk.sum.map((c) => c / bk.n) as Rgb);
  if (ranked.length === 0) return null;
  const [first] = ranked;
  const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const second = ranked.find((c) => distance(c, first) > 120) ?? null;
  return { brandColor: toHex(first), accentColor: second ? toHex(second) : null };
}
