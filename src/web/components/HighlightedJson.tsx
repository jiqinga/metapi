import React, { useEffect, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";

type HighlightedJsonProps = {
  code: string;
  style?: React.CSSProperties;
  /** Render the merged SSE content stream as a collapsible preview. */
  showSseMerged?: boolean;
};

function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.getAttribute("data-theme") === "dark";
  });
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
      return undefined;
    }
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  return first === "{" || first === "[" || first === '"';
}

function looksLikeSseStream(text: string): boolean {
  return /^data:\s/m.test(text.trim());
}

/**
 * Parse an SSE payload into raw event payloads. Each `data:` line starts a new
 * event; a `data:` line immediately followed by a non-`data:` line attaches
 * that continuation line to the same event (e.g. JSON on the line after the
 * prefix). Blank lines flush the current event. Works for streams with or
 * without blank-line separators between events.
 */
function parseSseEvents(text: string): string[] {
  const events: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let current: string[] | null = null;

  const flush = () => {
    if (current && current.length > 0) {
      events.push(current.join("\n").trim());
    }
    current = null;
  };

  for (const line of lines) {
    const m = line.match(/^data:\s?(.*)$/);
    if (m) {
      flush();
      current = [];
      current.push(m[1]);
    } else if (line.trim() === "") {
      flush();
    } else if (current !== null) {
      current.push(line);
    }
  }
  flush();
  return events;
}

/**
 * Extract the merged textual content from an SSE stream by concatenating
 * `choices[].delta.content` across all JSON chunks. Returns null when no
 * content can be extracted (e.g. only `[DONE]` markers).
 */
function extractSseMergedContent(text: string): string | null {
  const events = parseSseEvents(text);
  if (events.length === 0) return null;
  const parts: string[] = [];
  let any = false;
  for (const data of events) {
    const trimmed = data.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const choices = parsed?.choices;
      if (Array.isArray(choices)) {
        for (const choice of choices) {
          const content = choice?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            parts.push(content);
            any = true;
          }
        }
      }
    } catch {
      // ignore non-JSON data lines (e.g.
    }
  }
  return any ? parts.join("") : null;
}

const sseLineWrapStyle: React.CSSProperties = {
  display: "block",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function JsonLines({ code, isDark }: { code: string; isDark: boolean }) {
  const theme = isDark ? themes.vsDark : themes.vsLight;
  return (
    <Highlight code={code} language="json" theme={theme}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <>
          {tokens.map((line, i) => {
            const lineProps = getLineProps({ line });
            return (
              <div
                key={i}
                {...lineProps}
                style={{ ...lineProps.style, ...sseLineWrapStyle }}
              >
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            );
          })}
        </>
      )}
    </Highlight>
  );
}

function MergedSsePreview({
  text,
  isDark,
}: {
  text: string;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const merged = extractSseMergedContent(text);
  if (merged == null || merged.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: 8,
        border: "1px solid var(--color-border-light)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "none",
          background:
            "color-mix(in srgb, var(--color-bg-card) 86%, var(--color-bg) 14%)",
          color: "var(--color-text-primary)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>合并输出（共 {merged.length} 字符）</span>
        <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>
          {open ? "收起" : "展开"}
        </span>
      </button>
      {open ? (
        <div
          style={{
            padding: 12,
            background: "var(--color-bg)",
            borderTop: "1px solid var(--color-border-light)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--color-text-primary)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {merged}
        </div>
      ) : null}
    </div>
  );
}

export default function HighlightedJson({
  code,
  style,
  showSseMerged,
}: HighlightedJsonProps) {
  const isDark = useIsDarkTheme();

  if (looksLikeSseStream(code)) {
    const events = parseSseEvents(code);
    return (
      <div style={{ ...style, overflow: "auto" }}>
        {showSseMerged ? (
          <MergedSsePreview text={code} isDark={isDark} />
        ) : null}
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {events.map((payload, idx) => {
            const isDone = payload.trim() === "[DONE]";
            const isLast = idx === events.length - 1;
            return (
              <div
                key={idx}
                style={{
                  ...sseLineWrapStyle,
                  paddingBottom: isLast ? 0 : 10,
                  marginBottom: isLast ? 0 : 10,
                  borderBottom: isLast
                    ? "none"
                    : "1px dashed var(--color-border-light)",
                }}
              >
                <span
                  style={{
                    color: isDark ? "#c586c0" : "#af00db",
                    fontWeight: 600,
                  }}
                >
                  data:{" "}
                </span>
                {isDone ? (
                  <span
                    style={{
                      color: "var(--color-text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    [DONE]
                  </span>
                ) : looksLikeJson(payload) ? (
                  <JsonLines code={payload} isDark={isDark} />
                ) : (
                  <span>{payload || "\u200b"}</span>
                )}
              </div>
            );
          })}
        </pre>
      </div>
    );
  }

  if (!looksLikeJson(code)) {
    return <pre style={style}>{code}</pre>;
  }

  return (
    <pre
      style={{
        ...style,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      <JsonLines code={code} isDark={isDark} />
    </pre>
  );
}
