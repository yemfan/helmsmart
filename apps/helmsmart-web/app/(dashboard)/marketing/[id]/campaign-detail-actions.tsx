"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Send, Trash2 } from "lucide-react";
import { sendCampaign, deleteCampaign } from "@/lib/actions/campaigns";

interface Props {
  campaignId: string;
  status: string;
}

export function CampaignDetailActions({ campaignId, status }: Props) {
  const router = useRouter();
  const { t } = useTranslation("marketing");
  const [sending, startSend] = useTransition();
  const [deleting, startDelete] = useTransition();

  if (status !== "draft") return null;

  function handleSend() {
    startSend(async () => {
      await sendCampaign(campaignId);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!window.confirm(t("campaigns.detail.confirmDelete"))) return;
    startDelete(async () => {
      await deleteCampaign(campaignId);
      router.push("/marketing");
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {t("campaigns.detail.actionsTitle")}
      </h3>

      <button
        onClick={handleSend}
        disabled={sending || deleting}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
      >
        <Send className="w-4 h-4" />
        {sending ? t("common:status.sending") : t("campaigns.detail.send")}
      </button>

      <button
        onClick={handleDelete}
        disabled={sending || deleting}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-60 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {deleting ? t("campaigns.detail.deleting") : t("campaigns.detail.delete")}
      </button>
    </div>
  );
}
