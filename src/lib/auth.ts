import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 587),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  session: { strategy: "database" },
  // Required behind Railway's reverse proxy — Auth.js uses X-Forwarded-Host
  // to build callback URLs instead of inferring from the request.
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      // Hard allow-list. Blocks sign-in/signup for any email not explicitly
      // listed, even if they receive a magic link from some other channel.
      const allow = allowedEmails();
      if (allow.size === 0) {
        console.error(
          "[auth] ALLOWED_EMAILS is empty — rejecting all sign-ins"
        );
        return false;
      }
      const email = user.email?.toLowerCase() ?? "";
      return allow.has(email);
    },
  },
  pages: { signIn: "/login" },
});
