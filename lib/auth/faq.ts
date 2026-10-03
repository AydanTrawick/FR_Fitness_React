import fs from "node:fs";
import path from "node:path";
export type FAQ = { id: string; question: string; answer: string };
export function loadFaq(): FAQ[] {
  const directory = path.join(process.cwd(), "content/help");
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".mdx"))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(directory, file), "utf8");
      const [question, ...answer] = content.split("\n");
      return {
        id: file.replace(".mdx", ""),
        question: question.replace(/^# /, ""),
        answer: answer.join("\n").trim(),
      };
    });
}
