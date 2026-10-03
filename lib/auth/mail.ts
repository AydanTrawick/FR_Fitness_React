import { Resend } from "resend";
import { createElement } from "react";
import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { AccountEmail } from "@/emails/account-email";

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
  if (process.env.RESEND_API_KEY) {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.AUTH_EMAIL_FROM || "FirstRep <accounts@firstrep.app>",
      to,
      subject: title,
      react,
      attachments,
    });
    if (error) throw new Error("Account email delivery failed.");
    return;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.EMAIL_ADDRESS &&
    process.env.EMAIL_PASSWORD
  ) {
    await nodemailer
      .createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_ADDRESS,
          pass: process.env.EMAIL_PASSWORD,
        },
      })
      .sendMail({
        from: process.env.EMAIL_ADDRESS,
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
  throw new Error("Configure Resend to deliver account emails.");
}
