import { AuthFeature } from "../AuthLayout";
import { IconCalendarPlus, IconFile, IconLock } from "../icons";

/** O que o portal oferece, no painel da marca das telas de entrada. */
export const PORTAL_FEATURES: AuthFeature[] = [
  { title: "Nota fiscal", text: "PDF e XML da nota do mês, direto para o RH conferir.", icon: IconFile },
  { title: "Atestados e folgas", text: "Em breve: envio de atestado e pedido de folga.", icon: IconCalendarPlus },
  { title: "Só você vê", text: "Cada colaborador acessa apenas os próprios envios.", icon: IconLock },
];
