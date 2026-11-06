import { NextRequest, NextResponse } from "next/server";
import { localCopyDevice, localCopyList, localCopyTsv, markLocalCopySeen } from "@/lib/localCopy";

/** Lista em texto para o programa do Mac: "id<TAB>pasta<TAB>arquivo" por linha. */
export async function GET(request: NextRequest) {
  const device = await localCopyDevice(request);
  if (!device) {
    return new NextResponse("Chave recusada pelo RHGroup (desativada ou trocada).\n", {
      status: 401,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const body = localCopyTsv(await localCopyList());
  await markLocalCopySeen(device.id);
  return new NextResponse(body, {
    headers: { "Content-Type": "text/tab-separated-values; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
