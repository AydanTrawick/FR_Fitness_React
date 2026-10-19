import {
  biggestCardJump,
  cardDate,
  cardNumber,
  cardWeight,
  exerciseCardStats,
  type CardExercise,
  type CardSet,
  type CardUnit,
  type WorkoutCardData,
  type WorkoutCardStyle,
} from "./share-cards.ts";

type Ctx = CanvasRenderingContext2D;
type Style = Exclude<WorkoutCardStyle, "log">;
const blue = "#4b78ff",
  ink = "#f3f1eb",
  muted = "#a3a3a8",
  dark = "#161719";
const shades = [blue, "#4264c8", "#3856a4", "#30457d", "#293960", "#38393e"];
function face(c: Ctx, size: number, kind = "mono") {
  c.font =
    kind === "display"
      ? `italic 900 ${size}px CardDisplay`
      : kind === "sans"
        ? `900 ${size}px Arial, sans-serif`
        : kind === "body"
          ? `400 ${size}px Arial, sans-serif`
          : `500 ${size}px CardMono`;
}
function txt(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  size = 22,
  kind = "mono",
  color = ink,
  align: CanvasTextAlign = "left",
) {
  face(c, size, kind);
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(value, x, y);
  c.textAlign = "left";
}
function wrap(c: Ctx, value: string, width: number): string[] {
  const result: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if (line && c.measureText(line + " " + word).width > width) {
      result.push(line);
      line = "";
    }
    for (const ch of (line ? " " : "") + word) {
      if (line && c.measureText(line + ch).width > width) {
        result.push(line);
        line = "";
      }
      line += ch;
    }
  }
  if (line) result.push(line);
  return result;
}
function paragraph(
  c: Ctx,
  value: string,
  x: number,
  y: number,
  width: number,
  size = 22,
  kind = "mono",
  color = muted,
) {
  face(c, size, kind);
  const lines = wrap(c, value, width);
  for (const line of lines) {
    txt(c, line, x, y, size, kind, color);
    y += size * 1.22;
  }
  return y;
}
function rule(
  c: Ctx,
  y: number,
  color = "#2a2b2e",
  width = 1.5,
  dash = false,
  left = 74,
  right = 706,
) {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.setLineDash(dash ? [5, 4] : []);
  c.beginPath();
  c.moveTo(left, y);
  c.lineTo(right, y);
  c.stroke();
  c.setLineDash([]);
}
function rounded(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  radius = 9,
) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, Math.max(0, w), Math.max(0, h), radius);
  c.fill();
}
function compact(value: number) {
  return value >= 10000
    ? cardNumber(value / 1000, 1) + "K"
    : cardNumber(value, 1);
}
function weight(set: CardSet, unit: CardUnit) {
  return set.weightKg === 0 ? "BW" : cardNumber(cardWeight(set.weightKg, unit));
}
function amount(value: number, unit: CardUnit) {
  return compact(cardWeight(value, unit));
}
function title(
  c: Ctx,
  value: string,
  width: number,
  size = 36,
  kind = "display",
) {
  face(c, size, kind);
  return wrap(c, value.toUpperCase(), width);
}
function brand(c: Ctx, page: number, total: number, light = false) {
  const color = light ? "#171717" : ink;
  rule(c, 1370, light ? "#99968e" : "#292a2d");
  txt(c, "FIRSTREP", 74, 1445, 43, "display", color);
  txt(c, "F I T N E S S", 245, 1445, 19, "mono", blue);
  txt(
    c,
    "fr-fitness.vercel.app",
    74,
    1482,
    18,
    "mono",
    light ? "#575650" : muted,
  );
  txt(
    c,
    `CARD ${page + 1} / ${total}`,
    706,
    1482,
    18,
    "mono",
    light ? "#575650" : muted,
    "right",
  );
}
type Block = {
  exercise: CardExercise;
  index: number;
  sets: CardSet[];
  continuation: boolean;
  height: number;
};
function blocks(c: Ctx, data: WorkoutCardData, style: Style, unit: CardUnit) {
  const exercises =
    style === "volume" || style === "facts"
      ? [...data.exercises].sort(
          (a, b) =>
            exerciseCardStats(b).volumeKg - exerciseCardStats(a).volumeKg,
        )
      : data.exercises;
  const result: Block[] = [];
  exercises.forEach((exercise, index) => {
    const chunk =
      style === "ladder"
        ? 3
        : style === "receipt"
          ? 12
          : Math.max(1, exercise.sets.length);
    for (let offset = 0; offset < exercise.sets.length; offset += chunk) {
      const sets = exercise.sets.slice(offset, offset + chunk);
      let height: number;
      if (style === "ladder")
        height = Math.max(
          176,
          title(c, exercise.name, 225, 30).length * 36 + 104,
        );
      else if (style === "receipt") {
        face(c, 20);
        const names = wrap(
          c,
          `${sets.reduce((sum, s) => sum + s.count, 0)}× ${exercise.name.toUpperCase()}${offset > 0 ? " (CONT.)" : ""}`,
          465,
        ).length;
        face(c, 18);
        const detail = wrap(
          c,
          sets
            .map(
              (s) =>
                `${s.count > 1 ? s.count + "×(" : ""}${s.reps}×${weight(s, unit)}${s.count > 1 ? ")" : ""}`,
            )
            .join("  "),
          550,
        ).length;
        height = names * 25 + detail * 23 + 60;
      } else if (style === "facts")
        height = title(c, exercise.name, 430, 27, "sans").length * 32 + 43;
      else height = title(c, exercise.name, 430).length * 42 + 80;
      result.push({ exercise, index, sets, continuation: offset > 0, height });
    }
  });
  return result;
}
function paginate(blocks: Block[], capacity: number) {
  const pages: Block[][] = [[]];
  let used = 0;
  for (const block of blocks) {
    if (
      pages.at(-1)!.length &&
      (used + block.height > capacity || pages.at(-1)!.length >= 5)
    ) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push(block);
    used += block.height;
  }
  return pages;
}
function topSetText(e: CardExercise, unit: CardUnit) {
  const s = exerciseCardStats(e);
  return `${s.count} sets · top ${s.top?.reps ?? 0} × ${s.top ? weight(s.top, unit) : "0"} ${unit}`;
}
function volume(
  c: Ctx,
  data: WorkoutCardData,
  name: string,
  unit: CardUnit,
  page: number,
  pages: Block[][],
) {
  txt(c, cardDate(data.date), 74, 100, 23);
  txt(c, "V O L U M E  S P L I T", 706, 100, 20, "mono", blue, "right");
  txt(c, "T O T A L  V O L U M E  M O V E D", 74, 168, 17, "mono", muted);
  const n = amount(data.volumeKg, unit);
  let size = 172;
  face(c, size, "display");
  while (c.measureText(n).width > 510 && size > 70) face(c, --size, "display");
  txt(c, n, 74, 338, size, "display");
  const end = 74 + c.measureText(n).width;
  txt(c, unit.toUpperCase(), Math.min(630, end + 16), 338, 50, "display", blue);
  paragraph(
    c,
    `${data.exercises.length} exercises · ${data.totalSets} sets · ${name}`,
    74,
    377,
    632,
    21,
  );
  let x = 74;
  const ranked = [...data.exercises].sort(
    (a, b) => exerciseCardStats(b).volumeKg - exerciseCardStats(a).volumeKg,
  );
  if (data.volumeKg <= 0) rounded(c, 74, 424, 632, 27, "#292a2e", 4);
  else
    for (let i = 0; i < ranked.length; i++) {
      const v = exerciseCardStats(ranked[i]).volumeKg;
      const w = (632 * v) / data.volumeKg;
      rounded(c, x, 424, Math.max(0, w - 3), 27, shades[Math.min(i, 5)], 2);
      x += w;
    }
  txt(
    c,
    data.volumeKg > 0 ? "SHARE OF SESSION VOLUME" : "NO ADDED WEIGHT RECORDED",
    74,
    486,
    18,
    "mono",
    muted,
  );
  let y = 525;
  const max = Math.max(1, ...ranked.map((e) => exerciseCardStats(e).volumeKg));
  for (const block of pages[page]) {
    const stats = exerciseCardStats(block.exercise);
    txt(
      c,
      String(block.index + 1).padStart(2, "0"),
      74,
      y + 35,
      21,
      "mono",
      blue,
    );
    let sy = y + 24;
    for (const line of title(c, block.exercise.name, 430)) {
      txt(c, line, 137, sy, 36, "display");
      sy += 42;
    }
    rounded(c, 137, sy - 18, 430, 12, "#292a2e", 6);
    rounded(
      c,
      137,
      sy - 18,
      (430 * stats.volumeKg) / max,
      12,
      shades[Math.min(block.index, 5)],
      6,
    );
    txt(
      c,
      amount(stats.volumeKg, unit),
      706,
      sy - 11,
      43,
      "display",
      ink,
      "right",
    );
    txt(c, unit.toUpperCase(), 706, sy + 13, 15, "mono", muted, "right");
    paragraph(c, topSetText(block.exercise, unit), 137, sy + 29, 500, 18);
    y += block.height;
  }
  const shown = new Set(pages[page].map((b) => b.exercise));
  const rest = data.exercises.filter((e) => !shown.has(e));
  if (pages.length > 1 && y < 1280) {
    rule(c, 1290, "#38393e", 1.5, true);
    txt(
      c,
      `${rest.length} OTHER LIFTS · ${pages.length} CARDS`,
      88,
      1325,
      18,
      "mono",
      muted,
    );
    txt(
      c,
      amount(
        rest.reduce((sum, e) => sum + exerciseCardStats(e).volumeKg, 0),
        unit,
      ) +
        " " +
        unit.toUpperCase(),
      692,
      1325,
      18,
      "mono",
      ink,
      "right",
    );
  }
  brand(c, page, pages.length);
}
function ladder(
  c: Ctx,
  data: WorkoutCardData,
  unit: CardUnit,
  page: number,
  pages: Block[][],
  name: string,
) {
  txt(c, cardDate(data.date), 74, 100, 23);
  txt(c, "S E T  L A D D E R", 706, 100, 20, "mono", blue, "right");
  const improved = data.exercises.filter(
    (e) => exerciseCardStats(e).jump !== null,
  ).length;
  txt(c, improved ? "BUILT THE" : "PUT IN THE", 74, 228, 95, "display");
  txt(c, improved ? "LADDER" : "WORK", 74, 323, 95, "display");
  paragraph(
    c,
    improved
      ? `${improved} of ${data.exercises.length} lifts ended heavier than they started`
      : `${data.exercises.length} lifts · ${data.totalSets} completed sets`,
    74,
    367,
    425,
    21,
  );
  const jump = biggestCardJump(pages[page].map((b) => b.exercise));
  if (jump) {
    c.strokeStyle = blue;
    c.lineWidth = 3.5;
    c.beginPath();
    c.arc(615, 309, 90, 0, Math.PI * 2);
    c.stroke();
    txt(
      c,
      "+" + cardNumber(jump.jump!, 1) + "%",
      615,
      307,
      53,
      "display",
      ink,
      "center",
    );
    txt(c, "BIGGEST JUMP", 615, 336, 14, "mono", muted, "center");
    const label = title(c, jump.exercise.name, 144, 16, "mono");
    // The numbered lift below identifies even very long names without clipping the badge.
    txt(
      c,
      label.length === 1
        ? label[0]
        : `LIFT ${pages[page].find((b) => b.exercise === jump.exercise)!.index + 1}`,
      615,
      359,
      14,
      "mono",
      muted,
      "center",
    );
  }
  let y = 441;
  for (const b of pages[page]) {
    rule(c, y);
    txt(
      c,
      String(b.index + 1).padStart(2, "0") + (b.continuation ? " · CONT." : ""),
      74,
      y + 35,
      18,
      "mono",
      blue,
    );
    let sy = y + 72;
    for (const line of title(c, b.exercise.name, 225, 30)) {
      txt(c, line, 74, sy, 30, "display");
      sy += 36;
    }
    const stats = exerciseCardStats(b.exercise);
    if (!b.continuation) {
      const label =
        stats.jump !== null
          ? "+" + cardNumber(stats.jump, 1) + "%"
          : stats.last < stats.first
            ? "finished lighter"
            : "held";
      txt(
        c,
        label,
        74,
        sy + 8,
        17,
        "mono",
        stats.jump !== null ? "#bdccff" : muted,
      );
    }
    const max = Math.max(...b.exercise.sets.map((s) => s.weightKg), 1),
      w = (369 - (b.sets.length - 1) * 12) / b.sets.length;
    b.sets.forEach((set, i) => {
      const x = 338 + i * (w + 12),
        h = Math.max(8, (set.weightKg / max) * 112),
        bottom = y + b.height - 50;
      const last = set === b.exercise.sets.at(-1);
      rounded(c, x, bottom - h, w, h, last ? blue : "#2b2d31", 9);
      const value = weight(set, unit);
      let size = 29;
      face(c, size, "display");
      while (c.measureText(value).width > w - 12 && size > 15)
        face(c, --size, "display");
      txt(
        c,
        value,
        x + w / 2,
        bottom - h + (h > 45 ? 35 : -10),
        size,
        "display",
        last && h > 45 ? "#0c1532" : ink,
        "center",
      );
      const repsLabel = `${set.count > 1 ? set.count + "×" : ""}${set.reps} reps`;
      let repsSize = 16;
      face(c, repsSize);
      while (c.measureText(repsLabel).width > w - 6 && repsSize > 10)
        face(c, --repsSize);
      txt(
        c,
        repsLabel,
        x + w / 2,
        bottom + 27,
        repsSize,
        "mono",
        muted,
        "center",
      );
    });
    y += b.height;
  }
  txt(c, name, 74, 1318, 16, "mono", muted);
  txt(
    c,
    `LOAD IN ${unit.toUpperCase()} · FIRST TO FINAL SET`,
    74,
    1346,
    16,
    "mono",
    muted,
  );
  brand(c, page, pages.length);
}
function receipt(
  c: Ctx,
  data: WorkoutCardData,
  name: string,
  unit: CardUnit,
  page: number,
  pages: Block[][],
) {
  const black = "#171715",
    gray = "#5b5952";
  c.fillStyle = "#f2eee3";
  c.fillRect(47, 48, 686, 1464);
  for (let x = 58; x < 733; x += 24) {
    c.fillStyle = "#0b0c0d";
    c.beginPath();
    c.arc(x, 47, 11, 0, Math.PI);
    c.fill();
    c.beginPath();
    c.arc(x, 1513, 11, Math.PI, Math.PI * 2);
    c.fill();
  }
  txt(c, "FIRSTREP", 390, 156, 65, "display", black, "center");
  txt(
    c,
    "F I T N E S S  ·  S E S S I O N  R E C E I P T",
    390,
    193,
    17,
    "mono",
    black,
    "center",
  );
  txt(c, "fr-fitness.vercel.app", 390, 227, 19, "mono", gray, "center");
  rule(c, 260, gray, 1.4, true, 91, 689);
  txt(c, cardDate(data.date), 92, 295, 19, "mono", black);
  txt(
    c,
    `CARD ${page + 1} / ${pages.length}`,
    688,
    295,
    18,
    "mono",
    black,
    "right",
  );
  rule(c, 315, gray, 1.4, true, 91, 689);
  paragraph(c, "SESSION · " + name, 92, 339, 596, 14, "mono", gray);
  let y = 366;
  for (const b of pages[page]) {
    const count = b.sets.reduce((sum, s) => sum + s.count, 0),
      v = b.sets.reduce((sum, s) => sum + s.count * s.reps * s.weightKg, 0);
    y = paragraph(
      c,
      `${count}× ${b.exercise.name.toUpperCase()}${b.continuation ? " (CONT.)" : ""}`,
      92,
      y + 16,
      465,
      20,
      "mono",
      black,
    );
    txt(
      c,
      cardNumber(cardWeight(v, unit), 1),
      688,
      y - 24,
      21,
      "mono",
      black,
      "right",
    );
    y =
      paragraph(
        c,
        b.sets
          .map(
            (s) =>
              `${s.count > 1 ? s.count + "×(" : ""}${s.reps}×${weight(s, unit)}${s.count > 1 ? ")" : ""}`,
          )
          .join("  "),
        137,
        y + 6,
        550,
        18,
        "mono",
        gray,
      ) + 27;
  }
  rule(c, 1050, gray, 1.4, true, 91, 689);
  txt(c, "EXERCISES", 92, 1091, 21, "mono", black);
  txt(c, String(data.exercises.length), 688, 1091, 21, "mono", black, "right");
  txt(c, "SETS", 92, 1128, 21, "mono", black);
  txt(c, String(data.totalSets), 688, 1128, 21, "mono", black, "right");
  const heaviest = data.exercises
    .flatMap((e) => e.sets)
    .reduce<CardSet | null>(
      (best, set) =>
        !best ||
        set.weightKg > best.weightKg ||
        (set.weightKg === best.weightKg && set.reps > best.reps)
          ? set
          : best,
      null,
    );
  if (heaviest) {
    txt(c, "HEAVIEST SET", 92, 1165, 21, "mono", black);
    txt(
      c,
      `${heaviest.reps} × ${weight(heaviest, unit)} ${unit}`,
      688,
      1165,
      21,
      "mono",
      black,
      "right",
    );
  }
  rule(c, 1184, black, 3, false, 91, 689);
  txt(c, "TOTAL VOLUME", 92, 1242, 23, "mono", black);
  txt(
    c,
    amount(data.volumeKg, unit) + " " + unit.toUpperCase(),
    688,
    1242,
    57,
    "display",
    black,
    "right",
  );
  c.save();
  c.translate(390, 1320);
  c.rotate(-0.07);
  c.strokeStyle = blue;
  c.lineWidth = 5;
  c.strokeRect(-170, -48, 340, 95);
  txt(c, "SESSION LOGGED", 0, -1, 42, "display", blue, "center");
  txt(c, `${data.totalSets} SETS RECORDED`, 0, 28, 17, "mono", blue, "center");
  c.restore();
  for (let i = 0; i < 70; i++) {
    c.fillStyle = black;
    c.fillRect(246 + i * 4.1, 1400, i % 3 === 0 ? 3 : 1.6, 50);
  }
  txt(c, "THANK YOU FOR LIFTING", 390, 1480, 18, "mono", black, "center");
}
function facts(
  c: Ctx,
  data: WorkoutCardData,
  name: string,
  unit: CardUnit,
  page: number,
  pages: Block[][],
) {
  const black = "#151515";
  c.fillStyle = "white";
  c.fillRect(45, 42, 690, 1340);
  c.strokeStyle = "#6c6c6c";
  c.lineWidth = 2;
  c.strokeRect(45, 42, 690, 1340);
  txt(c, "Workout", 71, 134, 88, "sans", black);
  txt(c, "Facts", 71, 220, 88, "sans", black);
  txt(
    c,
    `${data.exercises.length} exercises per session`,
    72,
    267,
    27,
    "body",
    black,
  );
  const serving = paragraph(
    c,
    `Serving size   ${name} (${data.totalSets} sets)`,
    72,
    301,
    636,
    25,
    "sans",
    black,
  );
  rule(c, serving + 1, black, 14, false, 71, 709);
  txt(c, "Amount per session", 72, serving + 35, 20, "sans", black);
  txt(c, "Volume", 72, serving + 99, 55, "sans", black);
  const total = cardNumber(cardWeight(data.volumeKg, unit), 1) + " " + unit;
  let size = 56;
  face(c, size, "sans");
  while (c.measureText(total).width > 390 && size > 24) face(c, --size, "sans");
  txt(c, total, 708, serving + 99, size, "sans", black, "right");
  rule(c, serving + 123, black, 10, false, 71, 709);
  txt(c, "% Session Volume*", 708, serving + 155, 20, "sans", black, "right");
  let y = serving + 170;
  for (const b of pages[page]) {
    rule(c, y, black, 1.5, false, 71, 709);
    const s = exerciseCardStats(b.exercise);
    const names = title(c, b.exercise.name, 430, 27, "sans");
    let sy = y + 32;
    for (const line of names) {
      txt(c, line, 72, sy, 27, "sans", black);
      sy += 32;
    }
    txt(
      c,
      data.volumeKg > 0
        ? cardNumber((s.volumeKg / data.volumeKg) * 100, 1) + "%"
        : "—",
      708,
      y + 32,
      27,
      "sans",
      black,
      "right",
    );
    txt(
      c,
      `${amount(s.volumeKg, unit)} ${unit} · ${topSetText(b.exercise, unit)}`,
      87,
      sy - 7,
      18,
      "body",
      black,
    );
    y += b.height;
  }
  rule(c, y + 4, black, 12, false, 71, 709);
  y += 42;
  const all = data.exercises.flatMap((e) => e.sets),
    heaviest = Math.max(0, ...all.map((s) => s.weightKg)),
    reps = Math.max(0, ...all.map((s) => s.reps));
  txt(c, "Heaviest set", 72, y, 22, "body", black);
  txt(
    c,
    cardNumber(cardWeight(heaviest, unit)) + " " + unit,
    375,
    y,
    22,
    "sans",
    black,
    "right",
  );
  const jump = biggestCardJump(pages[page].map((b) => b.exercise));
  if (jump) {
    txt(c, "Biggest jump", 405, y, 22, "body", black);
    txt(
      c,
      "+" + cardNumber(jump.jump!, 1) + "%",
      708,
      y,
      22,
      "sans",
      black,
      "right",
    );
  }
  txt(c, "Most reps/set", 72, y + 38, 22, "body", black);
  txt(c, String(reps), 375, y + 38, 22, "sans", black, "right");
  txt(c, "Sets", 405, y + 38, 22, "body", black);
  txt(c, String(data.totalSets), 708, y + 38, 22, "sans", black, "right");
  rule(c, y + 59, black, 8, false, 71, 709);
  y += 94;
  y = paragraph(
    c,
    "* Share of recorded session volume (external or added weight × reps × sets). Percentages are rounded. Bodyweight alone adds no external volume.",
    72,
    y,
    636,
    18,
    "body",
    black,
  );
  if (jump)
    paragraph(
      c,
      `Biggest jump: ${jump.exercise.name}; first to final recorded set weight, +${cardNumber(jump.jump!, 1)}%.`,
      72,
      y + 8,
      636,
      18,
      "body",
      black,
    );
  txt(c, "FIRSTREP", 45, 1487, 41, "display");
  txt(c, "F I T N E S S", 200, 1487, 17, "mono", blue);
  txt(
    c,
    `${cardDate(data.date)} · ${page + 1}/${pages.length}`,
    735,
    1487,
    16,
    "mono",
    muted,
    "right",
  );
}
export function renderWorkoutDesign(
  canvas: HTMLCanvasElement,
  data: WorkoutCardData,
  name: string,
  unit: CardUnit,
  requestedPage: number,
  style: Style,
) {
  canvas.width = 1080;
  canvas.height = 2160;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Your browser could not create the card image.");
  c.scale(1080 / 780, 2160 / 1560);
  c.fillStyle = "#0b0c0d";
  c.fillRect(0, 0, 780, 1560);
  if (style === "volume" || style === "ladder") {
    rounded(c, 24, 24, 732, 1512, dark, 58);
    c.strokeStyle = "#28292c";
    c.lineWidth = 2;
    c.stroke();
  }
  const servingLines =
    style === "facts"
      ? (face(c, 25, "sans"),
        wrap(c, `Serving size   ${name} (${data.totalSets} sets)`, 636).length)
      : 1;
  const capacity =
    style === "ladder"
      ? 880
      : style === "receipt"
        ? 650
        : style === "facts"
          ? 500 - Math.max(0, servingLines - 1) * 31
          : 735;
  const pages = paginate(blocks(c, data, style, unit), Math.max(250, capacity));
  const page = Math.max(0, Math.min(requestedPage, pages.length - 1));
  if (style === "volume") volume(c, data, name, unit, page, pages);
  else if (style === "ladder") ladder(c, data, unit, page, pages, name);
  else if (style === "receipt") receipt(c, data, name, unit, page, pages);
  else facts(c, data, name, unit, page, pages);
  return pages.length;
}
