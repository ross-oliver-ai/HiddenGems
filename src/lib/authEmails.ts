import { appUrl, emailLayout, sendEmail } from "./email";
import { createToken } from "./tokens";

export async function sendVerificationEmail(userId: number, email: string, name: string): Promise<boolean> {
  const token = await createToken(userId, "verify_email");
  const url = `${await appUrl()}/verify?token=${token}`;
  return sendEmail(
    email,
    "Confirm your email for Hidden Gems",
    emailLayout({
      heading: `Welcome, ${name.split(" ")[0] || "there"}!`,
      body: "Tap the button to confirm your email and start using Hidden Gems. The link works for 24 hours.",
      buttonText: "Confirm my email",
      buttonUrl: url,
      footer: "If you didn't sign up, you can ignore this email.",
    }),
  );
}

export async function sendResetEmail(userId: number, email: string): Promise<boolean> {
  const token = await createToken(userId, "reset_password");
  const url = `${await appUrl()}/reset-password?token=${token}`;
  return sendEmail(
    email,
    "Reset your Hidden Gems password",
    emailLayout({
      heading: "Reset your password",
      body: "Tap the button to choose a new password. The link works for 1 hour.",
      buttonText: "Choose a new password",
      buttonUrl: url,
      footer: "If you didn't ask for this, you can ignore this email and your password stays the same.",
    }),
  );
}

export async function sendAlreadyHaveAccountEmail(userId: number, email: string): Promise<boolean> {
  const base = await appUrl();
  const reset = `${base}/reset-password?token=${await createToken(userId, "reset_password")}`;
  return sendEmail(
    email,
    "You already have a Hidden Gems account",
    emailLayout({
      heading: "You already have an account",
      body: "Someone (hopefully you) tried to sign up with this email, but it already has a Hidden Gems account. You can sign in, or reset your password if you've forgotten it.",
      buttonText: "Sign in",
      buttonUrl: `${base}/login`,
      footer: `Forgotten your password? Choose a new one here (the link works for 1 hour): ${reset}`,
    }),
  );
}
