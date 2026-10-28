import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portal do colaborador · CFFGROUP",
  description: "Envio de notas fiscais e pedidos ao RH da CFFGROUP.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Portal do colaborador: sempre no tema escuro; coluna estreita no celular, tela cheia com menu lateral no computador. */
export default function PortalLayout({ children }: LayoutProps<"/portal">) {
  return (
    <div data-theme="dark" className="flex flex-1 justify-center bg-bg text-ink">
      <div className="flex w-full max-w-[480px] flex-col lg:max-w-none">{children}</div>
    </div>
  );
}
