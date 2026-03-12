"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      {/* Left — Branding */}
      <div className="hidden lg:flex lg:flex-1 flex-col items-center justify-center bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 px-12 text-white">
        <div className="max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-10 w-10 text-amber-400"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M12 3v18M3 12h18M5.636 5.636l12.728 12.728M18.364 5.636L5.636 18.364"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Hogan Smith Law
            </h1>
            <div className="mt-2 h-0.5 w-16 mx-auto bg-amber-400/60 rounded-full" />
          </div>
          <p className="text-xl font-light text-white/80">Hearing Dashboard</p>
          <p className="text-sm text-white/50 leading-relaxed">
            Manage hearing assignments, representative scheduling, medical
            records tracking, and case management.
          </p>
        </div>
        <p className="absolute bottom-6 text-[11px] text-white/30">
          © {new Date().getFullYear()} Hogan Smith Law. All rights reserved.
        </p>
      </div>

      {/* Right — Login form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">
          {/* Mobile branding — shown below lg */}
          <div className="mb-8 text-center lg:hidden">
            <h1 className="text-2xl font-bold text-foreground">
              Hogan Smith Law
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hearing Dashboard
            </p>
          </div>

          <Card className="shadow-lg border-0 shadow-black/5">
            <CardHeader className="space-y-1 text-center pb-2">
              <CardTitle className="text-xl font-bold">Sign In</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter your credentials to continue
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
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

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="h-10"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-10"
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
