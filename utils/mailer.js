import nodemailer from "nodemailer";

let transporter;

// 🧱 Setup transporter (reuses one if already created)
async function getTransporter() {
  if (transporter) return transporter;

  // Try using your env vars first
  const user = process.env.ETHEREAL_USER;
  const pass = process.env.ETHEREAL_PASS;

  if (user && pass) {
    console.log("📧 Using Ethereal credentials from .env");
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: { user, pass },
    });
  } else {
    console.log("⚙️ Creating new Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    console.log("✅ Test account created:");
    console.log(testAccount);

    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  }

  return transporter;
}

// ✉️ Send activation email
export async function sendActivationEmail(to, username, activationUrl) {
  const transport = await getTransporter();

  const message = {
    from: '"Idle.fm" <no-reply@idle.fm>',
    to,
    subject: "Activate your Idle.fm account",
    html: `
      <h2>Welcome, ${username}!</h2>
      <p>Please activate your account by clicking below:</p>
      <a href="${activationUrl}" target="_blank">Activate My Account</a>
      <p>This link will expire in 24 hours.</p>
    `,
  };

  const info = await transport.sendMail(message);

  console.log(`📨 Email sent: ${info.messageId}`);

  console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
}

// ✉️ Send password reset email
export async function sendPasswordResetEmail(to, username, reset) {
  const transport = await getTransporter();

  const message = {
    from: '"Idle.fm" <no-reply@idle.fm>',
    to,
    subject: "Password Reset Request",
    html: `<h2>Hello, ${username}!</h2>
      <p>We received a request to reset your password. Click the link below to reset it:</p>
      <a href="${reset}" target="_blank">Reset Password</a>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `Hello, ${username}!\n\nWe received a request to reset your password. Click the link below to reset it:\n${reset}\n\nIf you didn't request this, please ignore this email.`,
  };

  const info = await transport.sendMail(message);

  console.log(`📨 Email sent: ${info.messageId}`);

  console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
}
