# PROTOTYPE — aggressive minimal workspace

Question: what should a more aggressive Codex-like Void short-drama workspace
look like without removing any stage, media preview, agent, or generation
capability?

This is a disposable, read-only visual prototype. It is not imported by Web UI
and must not be promoted directly to production.

Run:

```powershell
node docs/prototypes/aggressive-minimal-workspace/render.mjs
```

Open `index.html?variant=A`, `B`, or `C` to switch between:

- A — Codex Core: recommended default; full conversation, compact navigation,
  and an on-demand overlay short-drama panel.
- B — Media Focus: one selected media result is large; all other images move
  into a compact filmstrip.
- C — Command Stream: most aggressive; media, stage agents, and tool results
  collapse into Codex-style result rows until explicitly opened.

Pending verdict: select one base structure, then delete the losing variants and
rewrite the winner as a tested presentation slice.
