import { validateToken } from "./action";
import { PublicScheduleClient } from "./public-schedule-client";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicSchedulePage({ params }: Props) {
  const { token } = await params;
  const validation = await validateToken(token);

  return (
    <PublicScheduleClient
      token={token}
      initialValid={validation.valid}
      repName={validation.repName}
      initialError={validation.error}
    />
  );
}
