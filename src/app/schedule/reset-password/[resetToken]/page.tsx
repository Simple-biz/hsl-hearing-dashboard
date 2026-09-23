import { validateScheduleResetToken } from "./action";
import { ScheduleResetPasswordClient } from "./schedule-reset-password-client";

interface Props {
  params: Promise<{ resetToken: string }>;
}

export default async function ScheduleResetPasswordPage({ params }: Props) {
  const { resetToken } = await params;
  const validation = await validateScheduleResetToken(resetToken);

  return (
    <ScheduleResetPasswordClient
      resetToken={resetToken}
      initialValid={validation.valid}
      initialError={validation.error}
    />
  );
}
