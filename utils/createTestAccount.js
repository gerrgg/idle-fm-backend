import nodemailer from "nodemailer";

async function createTestAccount() {
  const testAccount = await nodemailer.createTestAccount();
  console.log("✅ Test account created:");
  console.log(testAccount);
}

createTestAccount();
