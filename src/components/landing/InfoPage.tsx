import type { ReactNode } from "react";
import { SITE, jsonLd } from "@/lib/site";
import { Footer, Header } from "./Landing";

/** A long-form public page (about, privacy, terms) in the landing page's frame. */
export default function InfoPage({
  title,
  lead,
  updated,
  schema,
  children,
}: {
  title: string;
  lead: string;
  // Shown under the title on policy pages, as a Jalali date.
  updated?: string;
  schema?: object;
  children: ReactNode;
}) {
  return (
    <div className="landing-root min-h-full">
      {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />}
      <Header />
      <main className="px-4 pt-12 sm:px-6 sm:pt-20">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-4xl leading-[1.3] font-medium text-balance sm:text-5xl">{title}</h1>
          <p className="mt-5 text-base leading-8 text-pretty text-(--muted) sm:text-lg">{lead}</p>
          {updated && (
            <p className="mt-3 text-xs text-(--muted)">
              آخرین به‌روزرسانی:{" "}
              <time dateTime={updated}>
                {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long" }).format(new Date(updated))}
              </time>
            </p>
          )}
          <div className="mt-12">{children}</div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

/** One section with an H2, so every heading on these pages is something a reader might search for. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="text-2xl leading-[1.4] font-medium sm:text-3xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-8 text-(--muted) [&_li]:ms-5 [&_li]:list-disc [&_li+li]:mt-2 [&_strong]:font-bold [&_strong]:text-(--fg)">
        {children}
      </div>
    </section>
  );
}

/** The contact line, shown only once a support address is configured. */
export function Contact({ children }: { children: ReactNode }) {
  if (!SITE.contactEmail) return null;
  return (
    <p>
      {children}{" "}
      <a href={`mailto:${SITE.contactEmail}`} className="text-(--lime) underline-offset-4 hover:underline" dir="ltr">
        {SITE.contactEmail}
      </a>
    </p>
  );
}
