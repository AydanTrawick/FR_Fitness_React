import { Resend } from "resend";
import { createElement } from "react";
import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { AccountEmail } from "@/emails/account-email";
import { accountMailConfig } from "./mail-config";

export async function accountMail(
  to: string,
  title: string,
  message: string,
  options: { code?: string; url?: string; screenshot?: string } = {},
) {
  const { db } = await import("@/lib/database");
  const deleted =
    await db()`SELECT id FROM "user" WHERE email=${to} AND deleted_at IS NOT NULL`;
  if (deleted.length && !options.code) return;
  if (
    process.env.AUTH_TEST_MODE === "true" &&
    process.env.NODE_ENV === "development" &&
    /^firstrep-test-[a-z0-9-]+@example\.invalid$/.test(to)
  ) {
    const { captureTestMail } = await import("./test-mailbox");
    captureTestMail({ to, title, message, ...options });
    return;
  }
  const attachments = options.screenshot
    ? [
        {
          filename: "screenshot.jpg",
          content: options.screenshot.split(",")[1],
        },
      ]
    : undefined;
  const react = createElement(AccountEmail, { title, message, ...options });
  const config = accountMailConfig();
  if (config.provider === "resend") {
    const { error } = await new Resend(config.apiKey).emails.send({
      from: config.from,
      to,
      subject: title,
      react,
      attachments,
    });
    if (error) throw new Error("Account email delivery failed.");
    return;
  }
  if (config.provider === "gmail") {
    await nodemailer
      .createTransport({
        service: "gmail",
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        auth: {
          user: config.user,
          pass: config.password,
        },
      })
      .sendMail({
        from: config.from,
        to,
        subject: title,
        html: await render(react),
        attachments: attachments?.map((a) => ({
          ...a,
          encoding: "base64" as const,
        })),
      });
    return;
  }
}
