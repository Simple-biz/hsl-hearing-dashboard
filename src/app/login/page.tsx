"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left — Branding panel */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* HSL blue background */}
        <div className="absolute inset-0 bg-[#1E3A7B]" />
        {/* Subtle cross pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Soft glow accents */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4 blur-3xl" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-12 text-white">
          <div className="max-w-md space-y-8 text-center">
            {/* Logo */}
            <div className="mx-auto w-64">
              <Image
                src="/HSL_Logo.png"
                alt="Hogan Smith Law"
                width={400}
                height={300}
                className="w-full h-auto rounded-xl shadow-2xl shadow-black/30"
                priority
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-white/20" />
              <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
              <div className="flex-1 h-px bg-white/20" />
            </div>

            {/* Text */}
            <div className="space-y-3">
              <h2 className="text-2xl font-light tracking-wide text-white/90">
                Hearing Management System
              </h2>
              <p className="text-sm text-white/50 leading-relaxed max-w-xs mx-auto">
                Manage hearing assignments, representative scheduling, medical
                records, and case management.
              </p>
            </div>
          </div>

          <p className="absolute bottom-6 text-[11px] text-white/25">
            © {new Date().getFullYear()} Hogan Smith Law. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right — Login form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <Image
              src="/HSL_Logo.png"
              alt="Hogan Smith Law"
              width={200}
              height={150}
              className="w-40 h-auto rounded-lg shadow-lg mb-4"
              priority
            />
            <p className="text-sm text-muted-foreground">
              Hearing Management System
            </p>
          </div>

          {/* Card */}
          <div className="rounded-xl border bg-card shadow-lg shadow-black/5 overflow-hidden">
            {/* Accent bar */}
            <div className="h-1 bg-[#1E3A7B]" />

            <div className="p-6 space-y-1 text-center">
              <h1 className="text-xl font-bold text-foreground">
                Welcome Back
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your account
              </p>
            </div>

            <div className="px-6 pb-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@hogansmith.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                    className="h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      disabled={loading}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-10 bg-[#1E3A7B] hover:bg-[#162D61] text-white"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing
                      in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground/50 lg:hidden">
            © {new Date().getFullYear()} Hogan Smith Law
          </p>
        </div>
      </div>
    </div>
  );
}
