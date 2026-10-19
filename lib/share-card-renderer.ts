import { renderWorkoutDesign } from "./workout-card-designs";
import type { WorkoutCardStyle } from "./share-cards";
import {
  cardDate,
  cardNumber,
  cardWeight,
  type CardUnit,
  type PRCardData,
  type WorkoutCardData,
  type CardExercise,
  type CardSet,
} from "./share-cards";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 2160;
const BG = "#111111",
  INK = "#f4f2ec",
  BLUE = "#4787fa",
  MUTED = "#a0a0a0",
  LINE = "#303030";
const M = 76,
  WIDTH = CARD_WIDTH - 2 * M;
let fonts: Promise<void> | undefined;
export function loadCardFonts() {
  return (fonts ??= Promise.all(
    [
      new FontFace(
        "CardDisplay",
        'url("/fonts/share-cards/barlow-condensed/BarlowCondensed-BlackItalic.ttf")',
        { weight: "900", style: "italic" },
      ),
      new FontFace(
        "CardHeading",
        'url("/fonts/share-cards/barlow-condensed/BarlowCondensed-Bold.ttf")',
        { weight: "700" },
      ),
      new FontFace(
        "CardMono",
        'url("/fonts/share-cards/ibm-plex-mono/IBMPlexMono-Medium.ttf")',
        { weight: "500" },
      ),
    ].map(async (font) => {
      document.fonts.add(await font.load());
    }),
  )
    .then(() => undefined)
    .catch((error) => {
      fonts = undefined;
      throw error;
    }));
}
type Ctx = CanvasRenderingContext2D;
function font(
  ctx: Ctx,
  size: number,
  family: "display" | "heading" | "mono" = "mono",
) {
  ctx.font =
    family === "display"
      ? "italic 900 " + size + "px CardDisplay"
      : family === "heading"
        ? "700 " + size + "px CardHeading"
        : "500 " + size + "px CardMono";
}
function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size: number,
  family: "display" | "heading" | "mono" = "mono",
  color = INK,
) {
  font(ctx, size, family);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function spaced(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  size = 29,
  color = MUTED,
  spacing = 5,
) {
  font(ctx, size);
  ctx.fillStyle = color;
  for (const character of value) {
    ctx.fillText(character, x, y);
    x += ctx.measureText(character).width + spacing;
  }
}
function lines(ctx: Ctx, value: string, width: number): string[] {
  const result: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if (line && ctx.measureText(line + " " + word).width > width) {
      result.push(line);
      line = "";
    }
    for (const character of (line ? " " : "") + word) {
      if (line && ctx.measureText(line + character).width > width) {
        result.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) result.push(line);
  return result;
}
function fitted(
  ctx: Ctx,
  value: string,
  width: number,
  maximum: number,
  minimum: number,
  family: "display" | "heading",
  maxLines = 2,
) {
  let size = maximum;
  font(ctx, size, family);
  while (size > minimum && lines(ctx, value, width).length > maxLines) {
    size -= 2;
    font(ctx, size, family);
  }
  return { size, lines: lines(ctx, value, width) };
}
function box(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
function base(canvas: HTMLCanvasElement) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create the card image.");
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.textBaseline = "alphabetic";
  return ctx;
}
function footer(ctx: Ctx, page = 1, total = 1) {
  text(ctx, "FIRSTREP", M, 2058, 66, "display");
  spaced(ctx, "FITNESS", 330, 2058, 27, BLUE, 7);
  text(ctx, "fr-fitness.vercel.app", M, 2104, 23, "mono", MUTED);
  const label = total > 1 ? "CARD " + page + " / " + total : "EVERY REP COUNTS";
  font(ctx, 22);
  ctx.fillStyle = MUTED;
  ctx.fillText(label, CARD_WIDTH - M - ctx.measureText(label).width, 2099);
  ctx.strokeStyle = INK;
  ctx.lineCap = "round";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(923, 2040);
  ctx.lineTo(1000, 2040);
  ctx.stroke();
  for (const x of [933, 945, 978, 990]) {
    ctx.beginPath();
    ctx.moveTo(x, x === 933 || x === 990 ? 2022 : 2028);
    ctx.lineTo(x, x === 933 || x === 990 ? 2058 : 2052);
    ctx.stroke();
  }
}
function workoutHeader(
  ctx: Ctx,
  data: WorkoutCardData,
  title: string,
  unit: CardUnit,
) {
  spaced(ctx, cardDate(data.date), M, 118);
  spaced(ctx, "WORKOUT", 840, 118, 29, BLUE, 4);
  const heading = fitted(ctx, title.toUpperCase(), WIDTH, 156, 60, "display");
  let y = 338;
  for (const line of heading.lines) {
    text(ctx, line, M - 4, y, heading.size, "display");
    y += heading.size;
  }
  y -= heading.size;
  y += 60;
  text(ctx, "EVERY SET. EVERY REP.", M, y, 30, "mono", MUTED);
  y += 156;
  const convertedVolume = cardWeight(data.volumeKg, unit);
  const v =
    convertedVolume >= 10000
      ? cardNumber(convertedVolume / 1000, 1) + "K"
      : cardNumber(convertedVolume, 1);
  [
    [String(data.exercises.length), "EXERCISES"],
    [String(data.totalSets), "SETS"],
    [v, "VOLUME (" + unit.toUpperCase() + ")"],
  ].forEach(([n, label], i) => {
    const x = M + i * 320;
    text(ctx, n, x, y, 90, "display");
    spaced(ctx, label, x, y + 48, 25, MUTED, 3);
  });
  y += 121;
  const ticks = Math.min(24, Math.max(1, data.totalSets));
  for (let i = 0; i < ticks; i++)
    box(ctx, M + i * (WIDTH / ticks), y, WIDTH / ticks - 10, 15, 8, BLUE);
  return y + 76;
}
type Section = {
  exercise: CardExercise;
  index: number;
  sets: CardSet[];
  header: { size: number; lines: string[] };
  height: number;
};
export function workoutPages(
  ctx: Ctx,
  data: WorkoutCardData,
  title: string,
  unit: CardUnit,
) {
  const top = workoutHeader(ctx, data, title, unit),
    capacity = 1945 - top;
  const pages: Section[][] = [[]];
  let used = 0;
  data.exercises.forEach((exercise, index) => {
    const heading = fitted(
      ctx,
      exercise.name.toUpperCase(),
      WIDTH - 118,
      54,
      36,
      "heading",
      2,
    );
    const headHeight = 24 + heading.lines.length * (heading.size + 5);
    let offset = 0;
    while (offset < exercise.sets.length) {
      let rowCount = Math.floor((capacity - used - headHeight - 16) / 132);
      if (rowCount < 1) {
        pages.push([]);
        used = 0;
        rowCount = Math.floor((capacity - headHeight - 16) / 132);
      }
      rowCount = Math.max(1, rowCount);
      const sets = exercise.sets.slice(offset, offset + rowCount * 3);
      const height = headHeight + Math.ceil(sets.length / 3) * 132 + 16;
      pages[pages.length - 1].push({
        exercise,
        index,
        sets,
        header: heading,
        height,
      });
      used += height;
      offset += sets.length;
    }
  });
  return { pages, top };
}
export function renderWorkoutCard(
  canvas: HTMLCanvasElement,
  data: WorkoutCardData,
  title: string,
  unit: CardUnit,
  page = 0,
  style: WorkoutCardStyle = "log",
) {
  if (style !== "log")
    return renderWorkoutDesign(canvas, data, title, unit, page, style);
  const ctx = base(canvas),
    layout = workoutPages(ctx, data, title, unit);
  let y = layout.top;
  for (const section of layout.pages[page] || []) {
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(CARD_WIDTH - M, y);
    ctx.stroke();
    text(
      ctx,
      String(section.index + 1).padStart(2, "0"),
      M + 8,
      y + 72,
      29,
      "mono",
      BLUE,
    );
    let h = y + 75;
    for (const line of section.header.lines) {
      text(ctx, line, M + 108, h, section.header.size, "heading");
      h += section.header.size + 5;
    }
    const setY =
      y + 24 + section.header.lines.length * (section.header.size + 5);
    section.sets.forEach((set, i) => {
      const w = (WIDTH - 44) / 3,
        x = M + (i % 3) * (w + 22),
        sy = setY + Math.floor(i / 3) * 132;
      box(
        ctx,
        x,
        sy,
        w,
        110,
        24,
        "#1d1d1d",
        i === section.sets.length - 1 ? BLUE : LINE,
      );
      const label =
        set.count === 1
          ? "SET " + set.number
          : "SETS " + set.number + "–" + (set.number + set.count - 1);
      spaced(ctx, label, x + 23, sy + 32, 20, MUTED, 2);
      const amount =
        String(set.reps) + " × " + cardNumber(cardWeight(set.weightKg, unit));
      let size = 43;
      font(ctx, size, "heading");
      while (ctx.measureText(amount + " " + unit).width > w - 42 && size > 25) {
        size--;
        font(ctx, size, "heading");
      }
      text(ctx, amount + " " + unit, x + 23, sy + 85, size, "heading");
    });
    y += section.height;
  }
  footer(ctx, page + 1, layout.pages.length);
  return layout.pages.length;
}
export function renderPRCard(canvas: HTMLCanvasElement, data: PRCardData) {
  const ctx = base(canvas);
  spaced(ctx, "NEW PERSONAL RECORD", M, 118, 29, BLUE, 5);
  const date = cardDate(data.date, true);
  font(ctx, 27);
  text(
    ctx,
    date,
    CARD_WIDTH - M - ctx.measureText(date).width,
    118,
    27,
    "mono",
    MUTED,
  );
  const cx = 540,
    cy = 500;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6 - Math.PI / 2;
    ctx.strokeStyle = i === 0 ? BLUE : "#393939";
    ctx.lineWidth = 27;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 224, cy + Math.sin(angle) * 224);
    ctx.lineTo(cx + Math.cos(angle) * 279, cy + Math.sin(angle) * 279);
    ctx.stroke();
  }
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = 47;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(448, 544);
  ctx.lineTo(540, 465);
  ctx.lineTo(633, 544);
  ctx.stroke();
  const heading = fitted(
    ctx,
    data.exercise.toUpperCase(),
    WIDTH,
    64,
    36,
    "heading",
    2,
  );
  let y = 907;
  for (const line of heading.lines) {
    font(ctx, heading.size, "heading");
    text(
      ctx,
      line,
      (CARD_WIDTH - ctx.measureText(line).width) / 2,
      y,
      heading.size,
      "heading",
    );
    y += heading.size + 6;
  }
  const weight =
    data.bodyweight && data.weight === 0
      ? "BW"
      : (data.bodyweight ? "+" : "") + cardNumber(data.weight, 6);
  let size = 315;
  font(ctx, size, "display");
  while (ctx.measureText(weight).width + 110 > WIDTH && size > 130) {
    size -= 5;
    font(ctx, size, "display");
  }
  const total = ctx.measureText(weight).width + 102,
    x = (CARD_WIDTH - total) / 2;
  text(ctx, weight, x, 1236, size, "display");
  font(ctx, size, "display");
  text(
    ctx,
    data.bodyweight && data.weight === 0 ? "" : data.unit.toUpperCase(),
    x + ctx.measureText(weight).width + 18,
    1236,
    68,
    "heading",
    BLUE,
  );
  const detail = "× " + data.reps + " " + (data.reps === 1 ? "REP" : "REPS");
  font(ctx, 34);
  text(
    ctx,
    detail,
    (CARD_WIDTH - ctx.measureText(detail).width) / 2,
    1310,
    34,
    "mono",
    MUTED,
  );
  if (data.previous !== undefined) {
    const delta =
      "+" +
      cardNumber(data.weight - data.previous, 6) +
      " " +
      data.unit +
      " over " +
      cardNumber(data.previous, 6) +
      " " +
      data.unit;
    font(ctx, 29);
    text(
      ctx,
      delta,
      (CARD_WIDTH - ctx.measureText(delta).width) / 2,
      1360,
      29,
      "mono",
      MUTED,
    );
  }
  const presets = ["BENCH", "SQUAT", "DEADLIFT"];
  const active = /bench|chest press/i.test(data.exercise)
    ? 0
    : /squat/i.test(data.exercise)
      ? 1
      : /deadlift/i.test(data.exercise)
        ? 2
        : -1;
  if (active !== -1)
    presets.forEach((preset, i) => {
      const w = (WIDTH - 42) / 3,
        px = M + i * (w + 21);
      box(
        ctx,
        px,
        1624,
        w,
        116,
        58,
        i === active ? "#1d1d1d" : BG,
        i === active ? BLUE : "#3a3a3a",
      );
      font(ctx, 33, "heading");
      text(
        ctx,
        preset,
        px + (w - ctx.measureText(preset).width) / 2,
        1697,
        33,
        "heading",
        i === active ? INK : MUTED,
      );
    });
  box(ctx, M, 1795, WIDTH, 150, 38, BLUE);
  font(ctx, 63, "display");
  text(
    ctx,
    "NEW PR",
    (CARD_WIDTH - ctx.measureText("NEW PR").width) / 2,
    1894,
    63,
    "display",
    BG,
  );
  footer(ctx);
}

export function canvasPNG(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(
              new Error("The card could not be exported. Please try again."),
            ),
      "image/png",
    ),
  );
}
export function downloadCardBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
