import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";

// Extend NextAuth types to include our custom fields
declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    forcePasswordChange: boolean;
  }
  interface Session {
    user: {
      id: number;
      email: string;
      name: string;
      role: string;
      forcePasswordChange: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: number;
    role: string;
    forcePasswordChange: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Look up user by email
        const { rows } = await db.query(
          "SELECT id, email, password_hash, full_name, role, is_active, force_password_change FROM users WHERE email = $1",
          [credentials.email.toLowerCase()],
        );

        const user = rows[0];
        if (!user) return null;

        // Check if account is active
        if (!user.is_active) return null;

        // Verify password (bcrypt hash from MySQL migrated directly)
        const isValid = await compare(credentials.password, user.password_hash);
        if (!isValid) return null;

        // Update last_login
        await db.query("UPDATE users SET last_login = NOW() WHERE id = $1", [
          user.id,
        ]);

        // Log login activity
        await db.query(
          "INSERT INTO activity_log (user_id, action, description, created_at) VALUES ($1, $2, $3, NOW())",
          [user.id, "user_login", `${user.full_name} logged in`],
        );

        return {
          id: String(user.id),
          email: user.email,
          name: user.full_name,
          role: user.role,
          forcePasswordChange: user.force_password_change,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, add custom fields to JWT
      if (user) {
        token.id = Number(user.id);
        token.role = user.role;
        token.forcePasswordChange = user.forcePasswordChange;
      }
      // Always refresh role and forcePasswordChange from DB (can change mid-session)
      if (token.id) {
        try {
          const { rows } = await db.query(
            "SELECT role, force_password_change FROM users WHERE id=$1",
            [token.id],
          );
          if (rows[0]) {
            token.role = rows[0].role;
            token.forcePasswordChange = rows[0].force_password_change;
          }
        } catch {}
      }
      return token;
    },
    async session({ session, token }) {
      // Pass custom fields from JWT to session
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.forcePasswordChange = token.forcePasswordChange;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours (matches old dashboard)
  },

  secret: process.env.NEXTAUTH_SECRET,
};
