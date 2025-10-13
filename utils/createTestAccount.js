import nodemailer from "nodemailer";
import { logger } from "./logger.js";

async function createTestAccount() {
  const testAccount = await nodemailer.createTestAccount();
  logger.info("✅ Test account created:");
  logger.info(testAccount);
}

createTestAccount();
