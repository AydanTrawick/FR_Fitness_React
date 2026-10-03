"use client";
import { useState, useEffect, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
let strengthModule:
  Promise<import("@zxcvbn-ts/core").ZxcvbnFactory> | undefined;
async function strength(password: string) {
  strengthModule ??= Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]).then(([core, common, en]) => {
    return new core.ZxcvbnFactory({
      translations: en.translations,
      graphs: common.adjacencyGraphs,
      dictionary: { ...common.dictionary, ...en.dictionary },
    });
  });
  return (await strengthModule).check(password).score;
}
export function PasswordInput({
  id,
  strengthMeter = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { strengthMeter?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [score, setScore] = useState(0);
  useEffect(() => {
    let cancelled = false;
    if (value)
      void strength(value).then((s) => {
        if (!cancelled) setScore(s);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  return (
    <>
      <div className="password-input">
        <input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          onChange={(e) => {
            setValue(e.target.value);
            props.onChange?.(e);
          }}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {strengthMeter && value && (
        <div className="password-strength" aria-live="polite">
          <div className="strength-track">
            <span
              style={{
                width: `${(score + 1) * 20}%`,
                background:
                  score < 2 ? "#e2a49c" : score < 3 ? "#d9bd89" : "#5b8cff",
              }}
            />
          </div>
          <small>
            {
              [
                "Easy to guess",
                "Needs a little more",
                "Getting stronger",
                "Strong",
                "Very strong",
              ][score]
            }
            . Try a few unrelated words.
          </small>
        </div>
      )}
    </>
  );
}
