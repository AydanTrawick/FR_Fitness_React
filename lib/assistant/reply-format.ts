const small = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const tens = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];
const scales = [
  "",
  "thousand",
  "million",
  "billion",
  "trillion",
  "quadrillion",
  "quintillion",
  "sextillion",
  "septillion",
  "octillion",
  "nonillion",
  "decillion",
];
function underThousand(value: number): string {
  if (value < 20) return small[value];
  if (value < 100)
    return [tens[Math.floor(value / 10)], value % 10 ? small[value % 10] : ""]
      .filter(Boolean)
      .join(" ");
  return `${small[Math.floor(value / 100)]} hundred${value % 100 ? " " + underThousand(value % 100) : ""}`;
}
function numberWords(value: string): string {
  const [integer, fraction] = value.replaceAll(",", "").split(".");
  const digits = integer.replace(/^0+(?=\d)/, "") || "0";
  const groups = digits.match(/\d{1,3}(?=(\d{3})*$)/g)!;
  // Work in digit groups, without rounding large numbers through Number.
  const whole =
    groups.length > scales.length
      ? [...digits].map((d) => small[Number(d)]).join(" ")
      : groups
          .map((part, i) =>
            Number(part)
              ? [underThousand(Number(part)), scales[groups.length - i - 1]]
                  .filter(Boolean)
                  .join(" ")
              : "",
          )
          .filter(Boolean)
          .join(" ") || "zero";
  return (
    whole +
    (fraction
      ? " point " + [...fraction].map((d) => small[Number(d)]).join(" ")
      : "")
  );
}
function ordinalWords(value: string) {
  const irregular: Record<string, string> = {
    one: "first",
    two: "second",
    three: "third",
    five: "fifth",
    eight: "eighth",
    nine: "ninth",
    twelve: "twelfth",
  };
  return numberWords(value).replace(
    /\w+$/,
    (word) =>
      irregular[word] ||
      (word.endsWith("y") ? word.slice(0, -1) + "ieth" : word + "th"),
  );
}
/** Human-readable prose only. Never apply this to structured logging payloads. */
export function formatAssistantReply(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[⁄∕]/g, "/")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "")
    .replace(/\b(can)[’']t\b/gi, "$1 not")
    .replace(/\bwon[’']t\b/gi, "will not")
    .replace(/\bshan[’']t\b/gi, "shall not")
    .replace(/n[’']t\b/gi, " not")
    .replace(/\b(I)[’']m\b/gi, "$1 am")
    .replace(/\b(you|we|they)[’']re\b/gi, "$1 are")
    .replace(/\b(I|you|we|they)[’']ve\b/gi, "$1 have")
    .replace(/\b(I|you|he|she|it|we|they|that|there)[’']ll\b/gi, "$1 will")
    .replace(/\b(it|that|there|here|what|who)[’']s\b/gi, "$1 is")
    .replace(
      /\b(\d{4})-(\d{2})-(\d{2})\b/g,
      (original, year: string, month: string, day: string) => {
        const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
        if (
          !Number.isFinite(date.getTime()) ||
          date.toISOString().slice(0, 10) !== original
        )
          return original;
        return `${date.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })} ${ordinalWords(day)}, ${numberWords(year)}`;
      },
    )
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (_, value: string) =>
      ordinalWords(value),
    )
    .replace(/(?<=\d)\s*[–—-]\s*(?=\d)/g, " to ")
    .replace(/(?<=\d)\s*[x×]\s*(?=\d)/gi, " times ")
    .replace(/\b1\s*RM\b/gi, "one rep maximum")
    .replace(/\b(\d+)\s*\/\s*(\d+)\b/g, "$1 over $2")
    .replace(/(^|[\s(])[-−](?=\d)/g, "$1minus ")
    .replace(
      /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+/g,
      (value) =>
        " " + numberWords(value.startsWith(".") ? "0" + value : value) + " ",
    )
    .replace(/\b(?:lbs?|pounds?)\b/gi, "pounds")
    .replace(/\bkg\b/gi, "kilograms")
    .replace(/\bg\b/g, "grams")
    .replace(/\bkcal\b/gi, "calories")
    .replace(/\bRPE\b/g, "R P E")
    .replace(/%/g, " percent ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/\//g, " per ")
    .replace(/[!?;]+/g, ".")
    .replace(/[:–—]/g, ", ")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{M}\s.,]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .replace(/([.,])(?:\s*[.,])+/g, "$1")
    .replace(/([.,])(?=\p{L})/gu, "$1 ")
    .trim();
}
