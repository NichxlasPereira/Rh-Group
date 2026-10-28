import { redirect } from "next/navigation";
import { PortalHome } from "@/components/portal/PortalHome";
import { currentPortalEmployee } from "@/lib/portalAccess";

export default async function PortalPage() {
  const employee = await currentPortalEmployee();
  if (!employee) redirect("/portal/entrar");
  return <PortalHome employee={employee} />;
}
