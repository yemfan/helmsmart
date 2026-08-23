// components/ResultCard.tsx
interface Props {
  title: string;
  value: string;
  details: string;
}

export default function ResultCard({ title, value, details }: Props) {
  const lines = details.split("\n").filter((line) => line.trim().length > 0);

  return (
    /* Tagged so the Calculate button can find the results without every
       calculator having to thread a ref through its own layout. */
    <section
      data-calc-results
      className="bg-white border border-gray-100 shadow-sm rounded-xl p-6 lg:p-8"
    >
      <header className="mb-4">
        <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {title}
        </p>
        <p className="mt-2 text-3xl lg:text-4xl font-bold text-blue-600">
          {value}
        </p>
      </header>
      {lines.length > 0 && (
        <dl className="mt-2 space-y-2 text-sm text-gray-700">
          {lines.map((line, index) => {
            const [label, rawValue] = line.split(":");
            const hasValue = typeof rawValue === "string";
            return (
              <div key={index} className="flex items-baseline justify-between gap-4">
                <dt className="text-gray-500">
                  {hasValue ? label : line}
                </dt>
                {hasValue && (
                  <dd className="font-medium text-gray-900">
                    {rawValue.trim()}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
