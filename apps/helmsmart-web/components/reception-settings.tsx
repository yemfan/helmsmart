"use client";

import { useState, useTransition } from "react";
import { toggleAutoReply, saveAutoReplyMsg, saveTwilioNumber } from "@/lib/actions/messages";
import { Phone, Save } from "lucide-react";

interface Props {
  orgId: string;
  twilioNumber: string | null;
  autoReply: boolean;
  autoReplyMsg: string;
}

export function ReceptionSettings({ twilioNumber, autoReply, autoReplyMsg }: Props) {
  const [number, setNumber]  = useState(twilioNumber ?? "");
  const [enabled, setEnabled] = useState(autoReply);
  const [msg, setMsg]         = useState(autoReplyMsg);
  const [saved, setSaved]     = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, start]    = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setSaveError(null);
    start(async () => {
      const res = await toggleAutoReply(next);
      if (!res.ok) {
        // Put the switch back. Leaving it flipped after a refused write is the
        // whole bug this is fixing — a control that shows a state the database
        // does not hold.
        setEnabled(!next);
        setSaveError(res.error);
      }
    });
  }

  function handleSave() {
    start(async () => {
      setNumberError(null);
      setSaveError(null);
      const res = await saveTwilioNumber(number);
      if (!res.ok) {
        setNumberError(res.error ?? "Invalid phone number.");
        return; // fix the number before saving the rest
      }
      if (res.value !== undefined) setNumber(res.value); // reflect the normalized form
      const msgRes = await saveAutoReplyMsg(msg);
      if (!msgRes.ok) {
        setSaveError(msgRes.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <h2 className="text-sm font-semibold text-slate-800">Auto-reply settings</h2>

      {/* Twilio number */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Twilio phone number
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={number}
              onChange={(e) => { setNumber(e.target.value); setNumberError(null); }}
              placeholder="+15555550100"
              aria-invalid={numberError ? true : undefined}
              className={`w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                numberError
                  ? "border-rose-300 focus:ring-rose-500"
                  : "border-slate-200 focus:ring-indigo-500"
              }`}
            />
          </div>
        </div>
        {numberError ? (
          <p className="text-xs text-rose-600 mt-1">{numberError}</p>
        ) : (
          <p className="text-xs text-slate-400 mt-1">
            Saved in E.164 format (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">+16265551234</code>). Must match the Twilio number routing to the agent.
          </p>
        )}
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-700">Auto-reply to missed calls</p>
          <p className="text-xs text-slate-400 mt-0.5">Send an SMS automatically when you don&apos;t answer</p>
        </div>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-indigo-600" : "bg-slate-200"
          }`}
        >
          <span
            className={`inline-block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Message */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1.5">
          Auto-reply message
        </label>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          rows={3}
          maxLength={160}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-slate-400">Sent via SMS to the caller&apos;s number</p>
          <p className="text-xs text-slate-400">{msg.length}/160</p>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Save className="w-4 h-4" />
        {saved ? "Saved!" : "Save changes"}
      </button>

      {/*
        A refused write has to say so. Without this the button still reads
        "Saved!" while the database is unchanged, which is exactly how a missing
        Twilio number went unnoticed until the voice agent refused to work.
      */}
      {saveError ? (
        <p className="text-xs text-rose-600" role="alert">
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
