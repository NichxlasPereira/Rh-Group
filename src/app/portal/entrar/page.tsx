import { redirect } from "next/navigation";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { currentPortalEmployee } from "@/lib/portalAccess";

export default async function PortalEntrarPage() {
  if (await currentPortalEmployee()) redirect("/portal");
  return <PortalLoginForm />;
}
