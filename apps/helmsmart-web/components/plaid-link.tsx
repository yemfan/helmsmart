"use client";

import { useState, useCallback, useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import type { PlaidLinkOnSuccess, PlaidLinkOnExit } from "react-plaid-link";
import { Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

interface Props {
  /** Optional: render a custom trigger instead of the default button. */
  children?: (props: { open: () => void; isReady: boolean; isLoading: boolean }) => React.ReactNode;
  /** Extra Tailwind classes for the default button variant. */
  className?: string;
  /**
   * UPDATE MODE. The `bank_connections` row to repair, when this button
   * offers to fix a bank that stopped importing rather than to link a new
   * one. Plaid reopens Link on the item that connection already holds, so
   * there is no new item and nothing to exchange — see `onSuccess`.
   */
  connectionId?: string;
}

/**
 * PlaidLink — opens the Plaid Link modal, exchanges the public token,
 * then refreshes the Books page data.
 *
 * Usage (default button):
 *   <PlaidLink />
 *
 * Usage (custom trigger via render prop):
 *   <PlaidLink>
 *     {({ open, isReady }) => <button onClick={open} disabled={!isReady}>Connect</button>}
 *   </PlaidLink>
 *
 * Usage (update mode — repair a bank that stopped importing):
 *   <PlaidLink connectionId={conn.id} />
 */
export function PlaidLink({ children, className = "", connectionId }: Props) {
  const router = useRouter();
  const { t } = useTranslation("books");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch a new link token lazily on first click
  const fetchLinkToken = useCallback(async () => {
    if (linkToken || fetchingToken) return;
    setFetchingToken(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionId ? { connection_id: connectionId } : {}),
      });
      const data = await res.json() as { link_token?: string; error?: string };
      if (!res.ok || !data.link_token) throw new Error(data.error ?? t("transactions.plaid.tokenFailed"));
      setLinkToken(data.link_token);
    } catch (e) {
      console.error("create Plaid link token", e);
      setError(t("transactions.plaid.initFailed"));
    } finally {
      setFetchingToken(false);
    }
  }, [linkToken, fetchingToken, connectionId, t]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setExchanging(true);
      setError(null);
      try {
        /*
         * UPDATE MODE NEVER EXCHANGES. Plaid repaired the existing item in
         * place, so the access token we already hold keeps working, and
         * spending this public token on exchange-token would create a SECOND
         * connection row for the same bank. What actually needs doing is
         * clearing the `status: 'error'` / `error_code` that `plaid-sync`
         * wrote — the reason `syncBankConnections` is still skipping it.
         */
        if (connectionId) {
          const repairRes = await fetch("/api/plaid/repair-connection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connection_id: connectionId }),
          });
          const repaired = await repairRes.json() as { connection_id?: string; error?: string };
          if (!repairRes.ok) throw new Error(repaired.error ?? t("transactions.plaid.repairFailed"));
          router.refresh();
          return;
        }

        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
            accounts: metadata.accounts.map((a) => ({
              id: a.id,
              name: a.name,
              // official_name is not in Plaid Link metadata; fetched from Plaid API during sync
              type: a.type,
              subtype: a.subtype ?? undefined,
              mask: a.mask ?? undefined,
            })),
          }),
        });
        const data = await res.json() as { connection_id?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? t("transactions.plaid.linkFailed"));
        // Refresh the page to show the newly linked accounts
        router.refresh();
      } catch (e) {
        console.error("exchange Plaid public token", e);
        // Two different failures: one bank never got linked, the other is
        // linked and still not importing. "Bank link failed" is wrong for the
        // second, and an error that misnames what happened sends the owner
        // looking in the wrong place.
        setError(t(connectionId ? "transactions.plaid.repairFailed" : "transactions.plaid.linkRetry"));
      } finally {
        setExchanging(false);
        setLinkToken(null); // invalidate token after use
      }
    },
    [router, connectionId, t]
  );

  const onExit = useCallback<PlaidLinkOnExit>((err) => {
    if (err) {
      console.warn("[plaid] link exited with error:", err);
    }
    // Token is single-use — clear so next open fetches fresh token
    setLinkToken(null);
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,   // null = deferred; Plaid won't load until a real token arrives
    onSuccess,
    onExit,
  });

  // Auto-open the Plaid modal once token has been fetched and iframe is ready.
  // The user only needs to click once.
  useEffect(() => {
    if (ready && linkToken) {
      open();
    }
  }, [ready, linkToken, open]);

  const handleClick = useCallback(async () => {
    // If already have a ready token, open immediately
    if (linkToken && ready) {
      open();
    } else {
      await fetchLinkToken();
    }
  }, [linkToken, ready, open, fetchLinkToken]);

  const isLoading = fetchingToken || exchanging;

  if (children) {
    return (
      <>
        {children({ open: handleClick, isReady: !!linkToken && ready, isLoading })}
        {error && <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium
                    bg-indigo-600 text-white hover:bg-indigo-700 transition-colors
                    disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Link2 className="w-4 h-4" />
        )}
        {exchanging ? t("transactions.plaid.linking") : fetchingToken ? t("transactions.plaid.preparing") : t("transactions.plaid.linkBank")}
        <span className="text-xs text-indigo-200">{t("transactions.plaid.connectVia")}</span>
      </button>
      {error && (
        <p className="mt-2 text-xs text-rose-600" role="alert">{error}</p>
      )}
    </div>
  );
}

