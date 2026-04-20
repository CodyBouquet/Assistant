"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = { role: "user" | "assistant"; text: string };

export function ChatClient() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await resp.json();
      setMessages([
        ...next,
        { role: "assistant", text: data.reply ?? "(no reply)" },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", text: "Something went wrong." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 min-h-[320px]">
        {messages.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Try: &ldquo;can I squeeze $500 for concert tickets this month?&rdquo;
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end bg-neutral-900 text-white rounded-2xl px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap"
                  : "self-start bg-neutral-100 rounded-2xl px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap"
              }
            >
              {m.text}
            </div>
          ))
        )}
        {busy && (
          <div className="self-start text-xs text-neutral-500">Thinking…</div>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything"
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
