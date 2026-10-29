
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const upload = document.getElementById("upload");
const download = document.getElementById("download");
const compare = document.getElementById("compare");
const fileName = document.getElementById("fileName");

let originalImage = null;
let originalData = null;
let showOriginal = false;
let rotation = 0;
let flipH = false;
let flipV = false;

const controls = [
  "exposure",
  "brightness",
  "contrast",
  "highlights",
  "shadows",
  "whites",
  "blacks",
  "saturation",
  "vibrance",
  "temperature",
  "tint",
  "sharpen",
  "noise",
  "vignette",
  "grain"
];

const values = {};

controls.forEach((name) => {
  const slider = document.getElementById(name);
  const output = document.getElementById(name + "Value");

  if (!slider) return;

  values[name] = Number(slider.value);

  slider.addEventListener("input", () => {
    values[name] = Number(slider.value);

    if (output) {
      output.textContent = slider.value;
    }

    renderImage();
  });
});

function loadImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Please select a valid image.");
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const image = new Image();

    image.onload = () => {
      originalImage = image;

      // Limit working resolution to approximately 18 megapixels.
      const maxPixels = 18000000;
      const scale = Math.min(
        1,
        Math.sqrt(maxPixels / (image.width * image.height))
      );

      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      rotation = 0;
      flipH = false;
      flipV = false;

      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      originalData = ctx.getImageData(
        0, 0, canvas.width, canvas.height
      );

      if (fileName) fileName.textContent = file.name;

      resetAdjustments(false);
      renderImage();
    };

    image.onerror = () => alert("Couldn't open this image.");
    image.src = event.target.result;
  };

  reader.readAsDataURL(file);
}

if (upload) {
  upload.addEventListener("change", (event) => {
    loadImage(event.target.files[0]);
  });
}

// Drag-and-drop image loading.
canvas.addEventListener("dragover", (event) => {
  event.preventDefault();
});

canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  loadImage(event.dataTransfer.files[0]);
});

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function renderImage() {
  if (!originalData) return;

  if (showOriginal) {
    ctx.putImageData(originalData, 0, 0);
    return;
  }

  const imageData = new ImageData(
    new Uint8ClampedArray(originalData.data),
    originalData.width,
    originalData.height
  );

  const data = imageData.data;

  const exposure = Math.pow(2, values.exposure || 0);
  const brightness = values.brightness || 0;
  const contrast = 1 + (values.contrast || 0) / 100;
  const saturation = 1 + (values.saturation || 0) / 100;
  const vibrance = (values.vibrance || 0) / 100;
  const temperature = values.temperature || 0;
  const tint = values.tint || 0;
  const highlights = (values.highlights || 0) * 0.65;
  const shadows = (values.shadows || 0) * 0.65;
  const whites = values.whites || 0;
  const blacks = values.blacks || 0;
  const grain = values.grain || 0;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Exposure and brightness.
    r = r * exposure + brightness;
    g = g * exposure + brightness;
    b = b * exposure + brightness;

    // Contrast around middle grey.
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;

    // Highlights and shadows.
    const luminance = (r + g + b) / 3;
    const shadowFactor = 1 - luminance / 255;
    const highlightFactor = luminance / 255;

    const tonalChange =
      shadows * shadowFactor + highlights * highlightFactor;

    r += tonalChange;
    g += tonalChange;
    b += tonalChange;

    // White and black point adjustments.
    r += whites * Math.max(0, (luminance - 190) / 65);
    g += whites * Math.max(0, (luminance - 190) / 65);
    b += whites * Math.max(0, (luminance - 190) / 65);

    r += blacks * Math.max(0, (65 - luminance) / 65);
    g += blacks * Math.max(0, (65 - luminance) / 65);
    b += blacks * Math.max(0, (65 - luminance) / 65);

    // White balance.
    r += temperature * 0.65 + tint * 0.15;
    g += tint * 0.3;
    b -= temperature * 0.65 - tint * 0.15;

    // Saturation and vibrance.
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const currentSaturation =
      maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

    const vibranceFactor =
      1 + vibrance * (1 - Math.min(1, currentSaturation));

    r = gray + (r - gray) * saturation * vibranceFactor;
    g = gray + (g - gray) * saturation * vibranceFactor;
    b = gray + (b - gray) * saturation * vibranceFactor;

    // Subtle grain.
    if (grain > 0) {
      const noise = (Math.random() - 0.5) * grain;
      r += noise;
      g += noise;
      b += noise;
    }

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
  }

  ctx.putImageData(imageData, 0, 0);

  // Apply sharpening and basic noise reduction.
  if ((values.sharpen || 0) > 0) {
    applySharpen(values.sharpen);
  }

  if ((values.noise || 0) > 0) {
    applyNoiseReduction(values.noise);
  }

  if ((values.vignette || 0) > 0) {
    applyVignette(values.vignette);
  }

  applyTransforms();
}

function applySharpen(amount) {
  const strength = Math.min(1, amount / 100) * 0.7;
  if (strength <= 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const source = ctx.getImageData(0, 0, w, h);
  const src = source.data;
  const output = new Uint8ClampedArray(src);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        const neighbours =
          src[i - w * 4 + c] +
          src[i + w * 4 + c] +
          src[i - 4 + c] +
          src[i + 4 + c];

        const sharpened = src[i + c] * 5 - neighbours;

        output[i + c] = clamp(
          src[i + c] * (1 - strength) + sharpened * strength
        );
      }
    }
  }

  source.data.set(output);
  ctx.putImageData(source, 0, 0);
}

function applyNoiseReduction(amount) {
  const radius = Math.min(3, Math.ceil(amount / 35));
  if (radius <= 0) return;

  const w = canvas.width;
  const h = canvas.height;
  const source = ctx.getImageData(0, 0, w, h);
  const src = source.data;
  const output = new Uint8ClampedArray(src);
  const blend = Math.min(0.65, amount / 150);

  for (let y = radius; y < h - radius; y++) {
    for (let x = radius; x < w - radius; x++) {
      const i = (y * w + x) * 4;

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let count = 0;

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const neighbour = ((y + dy) * w + (x + dx)) * 4 + c;
            sum += src[neighbour];
            count++;
          }
        }

        const average = sum / count;
        output[i + c] =
          src[i + c] * (1 - blend) + average * blend;
      }
    }
  }

  source.data.set(output);
  ctx.putImageData(source, 0, 0);
}

function applyVignette(amount) {
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const strength = amount / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const factor = 1 - Math.max(0, distance - 0.25) * strength * 0.7;
      const i = (y * w + x) * 4;

      data[i] *= factor;
      data[i + 1] *= factor;
      data[i + 2] *= factor;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function applyTransforms() {
  if (!rotation && !flipH && !flipV) return;

  const temp = document.createElement("canvas");
  temp.width = canvas.width;
  temp.height = canvas.height;
  temp.getContext("2d").drawImage(canvas, 0, 0);

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

  ctx.drawImage(temp, -temp.width / 2, -temp.height / 2);
  ctx.restore();
}

function resetAdjustments(render = true) {
  controls.forEach((name) => {
    const slider = document.getElementById(name);
    const output = document.getElementById(name + "Value");

    if (!slider) return;

    slider.value = slider.defaultValue;
    values[name] = Number(slider.value);

    if (output) output.textContent = slider.value;
  });

  rotation = 0;
  flipH = false;
  flipV = false;

  if (render) renderImage();
}

function autoEnhance() {
  if (!originalData) return;

  resetAdjustments(false);

  values.exposure = 0.15;
  values.contrast = 12;
  values.shadows = 12;
  values.highlights = -8;
  values.vibrance = 18;
  values.sharpen = 12;

  controls.forEach((name) => {
    const slider = document.getElementById(name);
    const output = document.getElementById(name + "Value");

    if (slider) slider.value = values[name];
    if (output) output.textContent = values[name];
  });

  renderImage();
}

function applyPreset(preset) {
  resetAdjustments(false);

  const presets = {
    original: {},
    balanced: {
      exposure: 0.1, contrast: 8, shadows: 10, vibrance: 12
    },
    brighten: {
      exposure: 0.3, shadows: 18, brightness: 5
    },
    crisp: {
      contrast: 18, saturation: 8, sharpen: 20
    },
    warm: {
      temperature: 18, saturation: 6, vibrance: 10
    },
    mono: {
      saturation: -100, contrast: 12
    }
  };

  const settings = presets[preset] || presets.balanced;

  Object.entries(settings).forEach(([name, value]) => {
    values[name] = value;

    const slider = document.getElementById(name);
    const output = document.getElementById(name + "Value");

    if (slider) slider.value = value;
    if (output) output.textContent = value;
  });

  renderImage();
}

if (compare) {
  compare.addEventListener("mousedown", () => {
    showOriginal = true;
    renderImage();
  });

  compare.addEventListener("mouseup", () => {
    showOriginal = false;
    renderImage();
  });

  compare.addEventListener("mouseleave", () => {
    showOriginal = false;
    renderImage();
  });

  compare.addEventListener("touchstart", (event) => {
    event.preventDefault();
    showOriginal = true;
    renderImage();
  }, { passive: false });

  compare.addEventListener("touchend", () => {
    showOriginal = false;
    renderImage();
  });
}

if (download) {
  download.addEventListener("click", () => {
    if (!originalData) {
      alert("Upload an image first.");
      return;
    }

    const link = document.createElement("a");
    const name = fileName ? fileName.textContent : "clearshot-image";

    link.download = "clearshot-" + name.replace(/\.[^/.]+$/, "") + ".jpg";
    link.href = canvas.toDataURL("image/jpeg", 0.95);
    link.click();
  });
}

// Connect optional buttons if they exist in index.html.
document.getElementById("autoEnhance")?.addEventListener(
  "click", autoEnhance
);

document.getElementById("reset")?.addEventListener(
  "click", () => resetAdjustments()
);

document.getElementById("rotateLeft")?.addEventListener("click", () => {
  rotation = (rotation - 90 + 360) % 360;
  renderImage();
});

document.getElementById("rotateRight")?.addEventListener("click", () => {
  rotation = (rotation + 90) % 360;
  renderImage();
});

document.getElementById("flipH")?.addEventListener("click", () => {
  flipH = !flipH;
  renderImage();
});

document.getElementById("flipV")?.addEventListener("click", () => {
  flipV = !flipV;
  renderImage();
});

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    applyPreset(button.dataset.preset);
  });
});

console.log("ClearShot loaded successfully.");
