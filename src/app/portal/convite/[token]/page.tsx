import { PortalInvite } from "@/components/portal/PortalInvite";

export default async function PortalConvitePage({ params }: PageProps<"/portal/convite/[token]">) {
  const { token } = await params;
  return <PortalInvite token={token} />;
}
