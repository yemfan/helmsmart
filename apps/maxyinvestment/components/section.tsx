export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-[92%] max-w-[1120px] ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-brand-500">{children}</p>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2.5 mb-8 font-serif text-[clamp(2.25rem,5vw,3.625rem)] font-bold leading-[1.05] text-navy-800">
      {children}
    </h2>
  );
}
