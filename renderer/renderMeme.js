require("dotenv").config();
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function wrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxChars) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getTextAnchor(alignment) {
  if (alignment === "left") return "start";
  if (alignment === "right") return "end";
  return "middle";
}

function getXPosition(slot, alignment) {
  if (alignment === "left") return slot.x + 20;
  if (alignment === "right") return slot.x + slot.width - 20;
  return slot.x + slot.width / 2;
}

function renderLines(lines, slot, style) {
  if (!lines.length) return "";

  const fontSize = style.fontSize;
  const lineHeight = Math.round(fontSize * 1.2);
  const x = getXPosition(slot, style.alignment);
  const totalTextHeight = lines.length * lineHeight;
  const startY = slot.y + (slot.height - totalTextHeight) / 2 + fontSize;

  return lines
    .map((line, i) => {
      const y = startY + i * lineHeight;

      const strokeAttrs =
        style.strokeWidth > 0 && style.strokeColor
          ? `stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" paint-order="stroke"`
          : "";

      return `<text x="${x}" y="${y}" class="caption" ${strokeAttrs}>${escapeXML(line)}</text>`;
    })
    .join("");
}

function buildSVG(template, slotTexts) {
  const fontSize = template.font_size || 48;
  const alignment = template.alignment || "center";
  const textColor = template.text_color || "#000000";
  const strokeColor = template.stroke_color || "";
  const strokeWidth = template.stroke_width || 0;
  const fontFamily = template.font || "Arial";

  const style = {
    fontSize,
    alignment,
    textColor,
    strokeColor,
    strokeWidth,
    fontFamily
  };

  const slots = [
    {
      text: slotTexts.slot_1_text || "",
      maxChars: template.slot_1_max_chars || 20,
      x: template.slot_1_x,
      y: template.slot_1_y,
      width: template.slot_1_width,
      height: template.slot_1_height
    },
    {
      text: slotTexts.slot_2_text || "",
      maxChars: template.slot_2_max_chars || 20,
      x: template.slot_2_x,
      y: template.slot_2_y,
      width: template.slot_2_width,
      height: template.slot_2_height
    },
    {
      text: slotTexts.slot_3_text || "",
      maxChars: template.slot_3_max_chars || 20,
      x: template.slot_3_x,
      y: template.slot_3_y,
      width: template.slot_3_width,
      height: template.slot_3_height
    }
  ].filter(slot => (
    slot.text &&
    slot.x !== null && slot.x !== undefined &&
    slot.y !== null && slot.y !== undefined &&
    slot.width !== null && slot.width !== undefined &&
    slot.height !== null && slot.height !== undefined
  ));

  const renderedText = slots
    .map(slot => {
      const lines = wrapText(slot.text, slot.maxChars);
      return renderLines(lines, slot, style);
    })
    .join("");

  return `
  <svg width="${template.canvas_width}" height="${template.canvas_height}">
    <style>
      .caption {
        fill: ${style.textColor};
        font-size: ${style.fontSize}px;
        font-family: ${style.fontFamily}, sans-serif;
        text-anchor: ${getTextAnchor(style.alignment)};
      }
    </style>
    ${renderedText}
  </svg>
  `;
}

async function renderTemplate(templateId, slotTexts, outputFileName) {
  const { data: template, error } = await supabase
    .from("meme_templates")
    .select("*")
    .eq("template_id", templateId)
    .single();

  if (error) {
    console.error("Error fetching template:", error);
    return;
  }

  const templatePath = `./templates/${template.image_filename}`;
  const svg = Buffer.from(buildSVG(template, slotTexts));
  const outputPath = `./${outputFileName}`;

  await sharp(templatePath)
    .composite([{ input: svg }])
    .toFile(outputPath);

  console.log(`Meme generated: ${outputPath}`);
}

renderTemplate(
  3,
  {
    slot_1_text: "LAUNCH NEW FEATURE",
    slot_2_text: "FIX OLD BUGS"
  },
  "output-two-buttons.png"
);
