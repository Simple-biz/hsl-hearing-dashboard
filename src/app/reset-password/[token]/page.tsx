import { validateResetToken } from "./action";
import { ResetPasswordClient } from "./reset-password-client";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  const validation = await validateResetToken(token);

  return (
    <ResetPasswordClient
      token={token}
      initialValid={validation.valid}
      initialError={validation.error}
    />
  );
}
