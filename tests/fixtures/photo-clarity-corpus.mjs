import sharp from "sharp";

/** Deterministic encoded-byte calibration controls, not customer photos or a trained model. */
export async function createClarityCorpus() {
  const width = 512;
  const height = 384;
  const pixels = (scene) => {
    const data = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const position = (y * width + x) * 3;
      const value = scene === "low_texture" ? 128
        : scene === "low_light" ? Math.min(35, 8 + (x * 17 + y * 31) % 24)
        : scene === "high_detail" ? ((x >> 2) + (y >> 2)) % 2 ? 235 : 20
        : scene === "stripes" ? x % 32 < 16 ? 205 : 50
        : scene === "portrait" ? Math.min(255, (((x - 256) ** 2 / 20_000 + (y - 192) ** 2 / 14_000 < 1) ? 150 : 50) + ((x + y) % 37 < 3 ? 70 : 0))
        : (x * 3 + y * 5) % 97 < 48 ? 210 : 35;
      data[position] = value;
      data[position + 1] = Math.min(255, value + x % 17);
      data[position + 2] = value;
    }
    return sharp(data, { raw: { width, height, channels: 3 } });
  };
  const motionKernel = Array(81).fill(0);
  for (let x = 0; x < 9; x++) motionKernel[4 * 9 + x] = 1;
  const cases = [
    ["sharp_detail", pixels("base"), "clear"],
    ["mild_defocus", pixels("base").blur(1.5), "soft_warning"],
    ["severe_defocus", pixels("base").blur(4), "strong_warning"],
    ["motion_blur", pixels("base").convolve({ width: 9, height: 9, kernel: motionKernel, scale: 9 }), "strong_warning"],
    ["sharp_stripes", pixels("stripes"), "clear"],
    ["mild_stripes", pixels("stripes").blur(1.5), "soft_warning"],
    ["sharp_portrait", pixels("portrait"), "clear"],
    ["mild_portrait", pixels("portrait").blur(1.5), "soft_warning"],
    ["low_texture", pixels("low_texture"), "inconclusive"],
    ["low_light_noise", pixels("low_light"), "inconclusive"],
    ["high_detail_false_positive", pixels("high_detail"), "clear"],
  ];
  return Promise.all(cases.map(async ([name, pipeline, expected]) => ({
    name, expected, bytes: await pipeline.jpeg({ quality: 90 }).toBuffer(),
  })));
}
