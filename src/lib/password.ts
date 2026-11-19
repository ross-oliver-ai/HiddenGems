import bcrypt from "bcryptjs";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

// Compared against when an email is unknown, so login timing doesn't reveal which emails exist.
let dummy: string | undefined;
export function dummyHash() {
  return (dummy ??= bcrypt.hashSync("not-a-real-password", 12));
}
