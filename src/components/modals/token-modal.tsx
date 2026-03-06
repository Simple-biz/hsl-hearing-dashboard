"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2 } from "lucide-react";
import {
  getRepToken,
  generateToken,
  revokeRepToken,
} from "@/app/(dashboard)/representatives/action";
import type { TokenInfo } from "@/app/(dashboard)/representatives/action";

interface Props {
  repId: number;
  repName: string;
  repEmail: string;
  onClose: () => void;
}

export function TokenModal({ repId, repName, repEmail, onClose }: Props) {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [expires, setExpires] = useState("");
  const [justGenerated, setJustGenerated] = useState(false);
  const [generatedPw, setGeneratedPw] = useState("");
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();

  // Load token on mount
  useEffect(() => {
    startTransition(() => {
      getRepToken(repId).then((info) => {
        setTokenInfo(info);
        setLoading(false);
      });
    });
  }, [repId]);

  const handleGenerate = async () => {
    if (!pw || pw.length < 4) {
      alert("Password must be at least 4 characters");
      return;
    }
    if (pw !== pwConfirm) {
      alert("Passwords do not match");
      return;
    }
    const res = await generateToken(repId, pw, expires || undefined);
    if (res.success) {
      setTokenInfo({
        hasToken: true,
        url: res.url,
        token: res.token,
        createdAt: "Just now",
        lastAccessed: "Never",
        expiresAt: expires || "Never",
      });
      setGeneratedPw(pw);
      setJustGenerated(true);
      setPw("");
      setPwConfirm("");
    }
  };

  const handleSendEmail = async () => {
    if (!repEmail || !generatedPw || !tokenInfo?.url) return;
    setSending(true);
    try {
      const webhookUrl = "/api/send-token-email";
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repId,
          repName,
          repEmail,
          password: generatedPw,
          scheduleUrl: tokenInfo.url,
        }),
      });
      alert("Email sent!");
      setJustGenerated(false);
    } catch {
      alert("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm(`Revoke link for ${repName}?`)) return;
    await revokeRepToken(repId);
    setTokenInfo({ hasToken: false });
    setJustGenerated(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-4">
          <h2 className="text-sm font-semibold">
            🔗 Manage Schedule Link — {repName}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : (
            <>
              {/* Existing token info */}
              {tokenInfo?.hasToken ? (
                <>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      ✅ Active Link Exists
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Schedule Link
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={tokenInfo.url || ""}
                        readOnly
                        className="h-10 text-xs font-mono"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(tokenInfo.url || "");
                          alert(
                            generatedPw
                              ? `Copied! Password: ${generatedPw}`
                              : "Copied!",
                          );
                        }}
                      >
                        📋 Copy
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Created</p>
                      <p className="font-semibold">{tokenInfo.createdAt}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Accessed</p>
                      <p className="font-semibold">{tokenInfo.lastAccessed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Expires</p>
                      <p className="font-semibold">{tokenInfo.expiresAt}</p>
                    </div>
                  </div>

                  {/* Email prompt after generation */}
                  {justGenerated && repEmail && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30 space-y-2">
                      <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                        📧 Link generated! Send credentials to {repName}?
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Email will be sent to: {repEmail}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                          onClick={handleSendEmail}
                          disabled={sending}
                        >
                          {sending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : null}
                          {sending ? "Sending..." : "📧 Send Email"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setJustGenerated(false);
                            alert(`Password: ${generatedPw}`);
                          }}
                        >
                          Skip — Show Password
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                    ⚠️ Generating a new link will deactivate the current one.
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                    ℹ️ No Active Link
                  </p>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    Generate a link so this rep can access their schedule.
                  </p>
                </div>
              )}

              {/* Generate form */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-semibold">Generate New Link</p>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Password *
                  </label>
                  <Input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    placeholder="Enter password (min 4 chars)"
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Confirm Password *
                  </label>
                  <Input
                    type="password"
                    value={pwConfirm}
                    onChange={(e) => setPwConfirm(e.target.value)}
                    placeholder="Confirm password"
                    className="h-10 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Expiration Date (Optional)
                  </label>
                  <Input
                    type="date"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t bg-muted/50 px-5 py-3">
          <Button
            size="sm"
            className="h-9 text-sm bg-green-600 hover:bg-green-700"
            onClick={handleGenerate}
            disabled={loading || !pw || pw.length < 4}
          >
            🔗 Generate New Link
          </Button>
          {tokenInfo?.hasToken && (
            <Button
              variant="destructive"
              size="sm"
              className="h-9 text-sm"
              onClick={handleRevoke}
            >
              🚫 Revoke
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
