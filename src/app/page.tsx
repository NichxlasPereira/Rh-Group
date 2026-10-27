"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { StatsCards } from "@/components/StatsCards";
import { SeedBanner } from "@/components/SeedBanner";
import { TabKey } from "@/components/Tabs";
import { Button } from "@/components/Button";
import { IconArrowDownTray, IconBox, IconChart, IconClock, IconPlus } from "@/components/icons";
import { RhSection, RhShell } from "@/components/attendance/RhShell";
import { SkeletonRows } from "@/components/attendance/formControls";
import { MaterialsTable } from "@/components/MaterialsTable";
import { WithdrawalsTable } from "@/components/WithdrawalsTable";
import { ReportsPanel } from "@/components/ReportsPanel";
import { SearchPanel, MaterialSortKey } from "@/components/SearchPanel";
import { MaterialModal, MaterialFormValues } from "@/components/MaterialModal";
import { WithdrawalModal, WithdrawalFormValues } from "@/components/WithdrawalModal";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { Material, Withdrawal, getStockStatus } from "@/lib/types";
import { endOtherModuleSession, logoutModule, redirectIfSessionExpired } from "@/lib/sessionClient";

const SECTION_COPY: Record<TabKey, { title: string; description: string }> = {
  estoque: {
    title: "Estoque",
    description: "Cadastre materiais, registre retiradas e acompanhe o estoque da CFFGROUP em um só lugar.",
  },
  historico: { title: "Histórico", description: "Todas as retiradas registradas: o quê, quanto, quem retirou e quando." },
  relatorios: { title: "Relatórios", description: "Consumo por período e categoria, e o que precisa de reposição." },
};

/** Sessão do estoque expirou (12h): volta para a tela de senha. */
function sessionExpired(res: Response): boolean {
  return redirectIfSessionExpired(res, "/entrar", "/");
}

export default function Home() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("estoque");

  const [materialSearch, setMaterialSearch] = useState("");
  const [materialCategory, setMaterialCategory] = useState("");
  const [materialSort, setMaterialSort] = useState<MaterialSortKey>("nome");
  const [historySearch, setHistorySearch] = useState("");

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [withdrawalPreselect, setWithdrawalPreselect] = useState<Material | null>(null);

  const [deletingMaterial, setDeletingMaterial] = useState<Material | null>(null);

  const fetchMaterials = useCallback(async () => {
    const res = await fetch("/api/materials");
    if (sessionExpired(res)) return;
    const data = await res.json();
    setMaterials(data);
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    const res = await fetch("/api/withdrawals");
    if (sessionExpired(res)) return;
    const data = await res.json();
    setWithdrawals(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchMaterials(), fetchWithdrawals()]).finally(() => setLoading(false));
    endOtherModuleSession("estoque");
  }, [fetchMaterials, fetchWithdrawals]);

  const stats = useMemo(() => {
    const total = materials.length;
    let lowStock = 0;
    let outOfStock = 0;
    for (const m of materials) {
      const status = getStockStatus(m.quantity, m.minQuantity);
      if (status === "baixo") lowStock++;
      if (status === "esgotado") outOfStock++;
    }
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const withdrawalsLast7Days = withdrawals.filter(
      (w) => new Date(w.timestamp).getTime() >= sevenDaysAgo
    ).length;

    return { total, lowStock, outOfStock, withdrawalsLast7Days };
  }, [materials, withdrawals]);

  const existingCategories = useMemo(
    () => Array.from(new Set(materials.map((m) => m.category))),
    [materials]
  );

  const sortedCategories = useMemo(
    () => [...existingCategories].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [existingCategories]
  );

  function openNewMaterial() {
    setEditingMaterial(null);
    setMaterialModalOpen(true);
  }

  function openEditMaterial(material: Material) {
    setEditingMaterial(material);
    setMaterialModalOpen(true);
  }

  function openWithdrawal(material: Material | null = null) {
    setWithdrawalPreselect(material);
    setWithdrawalModalOpen(true);
  }

  async function handleMaterialSubmit(values: MaterialFormValues) {
    const payload = {
      name: values.name.trim(),
      category: values.category.trim(),
      unit: values.unit.trim(),
      quantity: Number(values.quantity),
      minQuantity: values.minQuantity.trim() === "" ? 5 : Number(values.minQuantity),
      location: values.location.trim() || null,
      supplier: values.supplier.trim() || null,
      price: values.price.trim() === "" ? null : Number(values.price),
      purchaseLink: values.purchaseLink.trim() || null,
    };

    const isEdit = !!editingMaterial;
    const url = isEdit ? `/api/materials/${editingMaterial!.id}` : "/api/materials";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (sessionExpired(res)) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Não foi possível salvar o material.");
      }
      await fetchMaterials();
      setMaterialModalOpen(false);
      toast.success(isEdit ? "Material atualizado." : "Material cadastrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  async function handleDeleteConfirm(material: Material) {
    try {
      const res = await fetch(`/api/materials/${material.id}`, { method: "DELETE" });
      if (sessionExpired(res)) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Não foi possível excluir o material.");
      }
      await fetchMaterials();
      setDeletingMaterial(null);
      toast.success("Material excluído. O histórico foi preservado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  async function handleWithdrawalSubmit(values: WithdrawalFormValues): Promise<string | void> {
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: values.materialId,
          quantity: Number(values.quantity),
          date: values.date,
          withdrawnBy: values.withdrawnBy.trim(),
        }),
      });

      if (sessionExpired(res)) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 409) {
          await fetchMaterials();
          return body.error || "Estoque insuficiente.";
        }
        throw new Error(body.error || "Não foi possível registrar a retirada.");
      }

      await Promise.all([fetchMaterials(), fetchWithdrawals()]);
      setWithdrawalModalOpen(false);
      toast.success("Retirada registrada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  const sections: RhSection<TabKey>[] = [
    // O número no Estoque: materiais abaixo do mínimo ou esgotados.
    { key: "estoque", label: "Estoque", icon: IconBox, badge: stats.lowStock + stats.outOfStock },
    { key: "historico", label: "Histórico", icon: IconClock },
    { key: "relatorios", label: "Relatórios", icon: IconChart },
  ];
  const copy = SECTION_COPY[tab];

  return (
    <>
      <RhShell
        sections={sections}
        active={tab}
        onChange={setTab}
        moduleLabel="Estoque"
        navLabel="Almoxarifado"
        // O RH é restrito: o estoque não mostra o link (o acesso é por /frequencia).
        otherModules={[]}
        onLogout={async () => {
          await logoutModule("estoque");
          window.location.replace("/entrar");
        }}
        title={copy.title}
        description={copy.description}
        busy={loading}
        actions={
          <>
            <Button variant="ghost" onClick={openNewMaterial} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
              <IconPlus className="h-4 w-4" />
              Novo material
            </Button>
            <Button onClick={() => openWithdrawal(null)} className="!h-10 !rounded-[10px] !px-4 !py-0 text-[13px]">
              <IconArrowDownTray className="h-4 w-4" />
              Registrar retirada
            </Button>
          </>
        }
      >
        <SeedBanner />

        <StatsCards
          total={stats.total}
          lowStock={stats.lowStock}
          outOfStock={stats.outOfStock}
          withdrawalsLast7Days={stats.withdrawalsLast7Days}
        />

        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <SearchPanel
            tab={tab}
            categories={sortedCategories}
            materialSearch={materialSearch}
            onMaterialSearchChange={setMaterialSearch}
            materialCategory={materialCategory}
            onMaterialCategoryChange={setMaterialCategory}
            materialSort={materialSort}
            onMaterialSortChange={setMaterialSort}
            historySearch={historySearch}
            onHistorySearchChange={setHistorySearch}
          />

          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="rounded-[14px] border border-border bg-surface">
                <SkeletonRows />
              </div>
            ) : tab === "estoque" ? (
              <MaterialsTable
                materials={materials}
                search={materialSearch}
                category={materialCategory}
                sort={materialSort}
                onWithdraw={(m) => openWithdrawal(m)}
                onEdit={openEditMaterial}
                onDelete={setDeletingMaterial}
              />
            ) : tab === "historico" ? (
              <WithdrawalsTable withdrawals={withdrawals} search={historySearch} />
            ) : (
              <ReportsPanel materials={materials} withdrawals={withdrawals} />
            )}
          </div>
        </div>
      </RhShell>

      <MaterialModal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        onSubmit={handleMaterialSubmit}
        material={editingMaterial}
        existingCategories={existingCategories}
      />

      <WithdrawalModal
        open={withdrawalModalOpen}
        onClose={() => setWithdrawalModalOpen(false)}
        onSubmit={handleWithdrawalSubmit}
        materials={materials}
        preselectedMaterial={withdrawalPreselect}
      />

      <DeleteConfirmModal
        material={deletingMaterial}
        onClose={() => setDeletingMaterial(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
