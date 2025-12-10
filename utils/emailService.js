import sgMail from "@sendgrid/mail";
import { renderEmailTemplate } from "./emailTemplate.js";
import { logger } from "./logger.js";

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const FROM = {
  email: process.env.SENDGRID_FROM || "no-reply@idle.fm",
  name: "Idle.fm",
};

export async function sendEmail(to, subject, templateData) {
  const html = renderEmailTemplate(templateData);

  const msg = {
    to,
    from: FROM,
    subject,
    html,
  };

  try {
    await sgMail.send(msg);
    logger.info(`📨 Email sent to ${to}`);
  } catch (err) {
    logger.error("❌ SendGrid error:", err.response?.body || err);
    throw err;
  }
}

export async function sendActivationEmail(to, username, url) {
  return sendEmail(to, "Activate your Idle.fm account", {
    title: "Activate Your Account",
    greeting: `Welcome to Idle.fm, ${username}!`,
    body: "Click the button below to activate your account and get started.",
    buttonText: "Activate My Account",
    buttonUrl: url,
  });
}

export async function sendPasswordResetEmail(to, username, url) {
  return sendEmail(to, "Reset your Idle.fm password", {
    title: "Password Reset Request",
    greeting: `Hello ${username},`,
    body: "A request was made to reset your password. Click below to continue.",
    buttonText: "Reset Password",
    buttonUrl: url,
  });
}
