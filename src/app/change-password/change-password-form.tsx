"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { changePassword } from "./actions";

export function ChangePasswordForm({
  userName,
  isForced,
}: {
  userName: string;
  isForced: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const passwordStrength = (() => {
    if (!newPassword) return null;
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)) score++;
    if (/\d/.test(newPassword)) score++;
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++;
    if (score <= 2)
      return { label: "Weak", color: "text-red-500", bg: "bg-red-500" };
    if (score <= 3)
      return { label: "Fair", color: "text-amber-500", bg: "bg-amber-500" };
    return { label: "Strong", color: "text-emerald-500", bg: "bg-emerald-500" };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await changePassword({
        currentPassword: isForced ? undefined : currentPassword,
        newPassword,
        confirmPassword,
        forced: isForced,
      });
      setSuccess(true);
      // JWT callback refreshes forcePasswordChange from DB, so just redirect
      setTimeout(() => router.push("/"), 2000);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to change password",
      );
      setSaving(false);
    }
  };

  if (success) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">Password Changed</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Redirecting to dashboard...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-xl">Change Password</CardTitle>
        <CardDescription>
          {isForced ? (
            <span className="text-amber-600 dark:text-amber-400">
              You must set a new password before continuing
            </span>
          ) : (
            `Update your password, ${userName}`
          )}
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {isForced && (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 dark:bg-amber-950/20 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Your administrator has required you to change your password. You
                cannot access the dashboard until you set a new password.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {!isForced && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Current Password
              </label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="h-10"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              New Password
            </label>
            <div className="flex gap-1.5">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError("");
                }}
                required
                minLength={8}
                className="h-10 flex-1"
                placeholder="At least 8 characters"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            {passwordStrength && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        i <=
                          (passwordStrength.label === "Weak"
                            ? 2
                            : passwordStrength.label === "Fair"
                              ? 3
                              : 5)
                          ? passwordStrength.bg
                          : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <p
                  className={cn("text-xs font-medium", passwordStrength.color)}
                >
                  {passwordStrength.label}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Confirm New Password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-10"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1 text-xs text-destructive">
                Passwords do not match
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-10"
            disabled={
              saving ||
              !newPassword ||
              newPassword !== confirmPassword ||
              newPassword.length < 8
            }
          >
            {saving ? "Changing..." : "Change Password"}
          </Button>

          {!isForced && (
            <Button
              type="button"
              variant="link"
              className="w-full text-xs text-muted-foreground"
              onClick={() => router.push("/")}
            >
              Cancel and go back
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
