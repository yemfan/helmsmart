import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        gap: 12,
      }}
    >
      <p style={{ fontFamily: "var(--font-mono)", color: "var(--color-accent)", letterSpacing: "0.1em" }}>
        404
      </p>
      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32 }}>
        Guide not found
      </h1>
      <p style={{ color: "var(--color-ink-soft)", maxWidth: 380 }}>
        This guide may have been unpublished or the link is incorrect.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 8,
          background: "var(--color-ink)",
          color: "#fff",
          padding: "12px 20px",
          borderRadius: 10,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go home
      </Link>
    </main>
  );
}
