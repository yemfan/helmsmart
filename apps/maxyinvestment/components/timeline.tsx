import type { Milestone } from "@/lib/content";

/**
 * Alternating spine timeline. Shared by the homepage's "Our Journey" and the
 * About page, which render different slices of the same history.
 */
export function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="relative mx-auto max-w-[960px]">
      {/* Spine: hugs the left edge on mobile, centered once the rows alternate. */}
      <div
        aria-hidden
        className="absolute bottom-0 left-2.5 top-0 w-[3px] bg-gradient-to-b from-brand-500 to-navy-800 md:left-1/2"
      />

      {items.map((item, i) => {
        const isLeft = i % 2 === 0;
        return (
          <li
            key={item.year + item.name}
            className={[
              "relative w-full pb-7 pl-11",
              "md:w-1/2 md:pb-8 md:pl-0",
              isLeft ? "md:pr-10 md:text-right" : "md:ml-[50%] md:pl-10",
            ].join(" ")}
          >
            <span
              aria-hidden
              className={[
                "absolute top-1.5 left-px h-[18px] w-[18px] rounded-full border-[5px] border-brand-500 bg-white",
                isLeft ? "md:left-auto md:-right-[10px]" : "md:-left-[8px]",
              ].join(" ")}
            />
            <div className="rounded-2xl border border-line bg-mist p-5 sm:p-[22px]">
              <p className="font-extrabold tracking-[0.12em] text-brand-500">{item.year}</p>
              <h3 className="mt-1 mb-2 font-serif text-lg font-bold text-navy-800">{item.name}</h3>
              <p className="text-navy-500">{item.summary}</p>
              <p className="mt-2 font-bold text-navy-800">{item.location}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
