"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { SmartList } from "@/lib/contacts/types";

type Props = {
  lists: SmartList[];
  activeListId: string | null;
};

/**
 * Horizontal tab bar for Smart Lists. Defaults (Leads/Sphere/All) render
 * first by sort_order. Custom lists after. Hidden lists are omitted from
 * the bar but visible in the "Manage" popover.
 *
 * Active list is driven by ?list=<id> URL param so server components can
 * read it and pre-filter the contact list in the same SSR pass.
 */
export default function SmartListTabs({ lists, activeListId }: Props) {
  const { t } = useTranslation("web_contacts");
  const visible = lists.filter((l) => !l.isHidden);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <nav aria-label={t("smart_lists.nav_a11y")} className="flex flex-wrap items-center gap-1">
          {visible.map((list) => {
            const isActive = list.id === activeListId;
            return (
              <Link
                key={list.id}
                href={`?list=${encodeURIComponent(list.id)}`}
                scroll={false}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
                title={list.description ?? undefined}
              >
                {list.name}
                {list.isDefault && (
                  <span
                    className={`ml-1.5 text-[10px] uppercase tracking-wide ${
                      isActive ? "text-white/60" : "text-gray-400"
                    }`}
                  >
                    {t("smart_lists.default_badge")}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3 w-3" aria-hidden /> {t("smart_lists.manage")}
          </button>
        </div>
      </div>
      {manageOpen && (
        <SmartListManager
          lists={lists}
          onClose={() => setManageOpen(false)}
        />
      )}
    </div>
  );
}

function SmartListManager({
  lists,
  onClose,
}: {
  lists: SmartList[];
  onClose: () => void;
}) {
  const { t } = useTranslation("web_contacts");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  /**
   * The reason a request failed, in the reader's language.
   *
   * Every handler here used to throw an Error whose message was the HTTP
   * status, then render it with `e instanceof Error ? e.message : t(fallback)`.
   * Because it always threw an Error, the translated fallback was unreachable
   * dead code and a failed save displayed the bare string "500" — which is
   * exactly what an agent saw on trying to add a list. The route explains
   * itself in the response body; this reads that, translates the codes it
   * knows, and leaves the untranslated detail in the console for whoever is
   * debugging rather than in the face of whoever is working.
   */
  async function failureMessage(res: Response, fallbackKey: string): Promise<string> {
    let code: string | null = null;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body?.error === "string") code = body.error;
    } catch {
      // No JSON body — the translated fallback below still applies.
    }
    if (code) console.error("[smart-lists]", res.status, code);
    if (code === "smart_lists_unavailable") {
      return t("smart_lists.manager.errors.unavailable");
    }
    return t(fallbackKey);
  }

  async function toggleHidden(list: SmartList) {
    setPendingId(list.id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/smart-lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHidden: !list.isHidden }),
      });
      if (!res.ok) {
        setError(await failureMessage(res, "smart_lists.manager.errors.update_failed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("smart_lists.manager.errors.update_failed"));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(list: SmartList) {
    if (list.isDefault) return;
    setPendingId(list.id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/smart-lists/${list.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await failureMessage(res, "smart_lists.manager.errors.delete_failed"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("smart_lists.manager.errors.delete_failed"));
    } finally {
      setPendingId(null);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setPendingId("__new__");
    setError(null);
    try {
      const res = await fetch("/api/dashboard/smart-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          filterConfig: {},
        }),
      });
      if (!res.ok) {
        setError(await failureMessage(res, "smart_lists.manager.errors.create_failed"));
        return;
      }
      setNewName("");
      setCreating(false);
      router.refresh();
    } catch {
      setError(t("smart_lists.manager.errors.create_failed"));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          {t("smart_lists.manager.heading")}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          aria-label={t("smart_lists.manager.close_a11y")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {lists.map((list) => (
          <li
            key={list.id}
            className="flex items-center justify-between rounded-md bg-white px-3 py-1.5 text-sm shadow-sm"
          >
            <span className="flex items-center gap-2">
              <span className="text-gray-900">{list.name}</span>
              {list.isDefault && (
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                  {t("smart_lists.default_badge")}
                </span>
              )}
              {list.isHidden && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                  {t("smart_lists.hidden_badge")}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleHidden(list)}
                disabled={pendingId === list.id}
                className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {list.isHidden ? t("smart_lists.manager.show") : t("smart_lists.manager.hide")}
              </button>
              {!list.isDefault && (
                <button
                  type="button"
                  onClick={() => remove(list)}
                  disabled={pendingId === list.id}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                  aria-label={t("smart_lists.manager.delete_a11y")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        {creating ? (
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("smart_lists.manager.new_placeholder")}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <button
              type="button"
              onClick={create}
              disabled={pendingId === "__new__"}
              className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {t("smart_lists.manager.add_inline")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
            >
              {t("smart_lists.manager.cancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-white"
          >
            <Plus className="h-3 w-3" /> {t("smart_lists.manager.add_smart_list")}
          </button>
        )}
        <p className="mt-2 text-[11px] text-gray-500">{t("smart_lists.manager.hint")}</p>
      </div>
    </div>
  );
}
