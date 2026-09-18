import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { frappe } from "@/lib/frappe"

export interface PrintHeaderDoc {
  school_name?: string
  address?: string
  phone?: string
  logo?: string
}

/** Escapes text before it's interpolated into a print window's
 * document.write'd HTML. Matches every print call site's own local copy
 * (see official-transcript-of-records.tsx) — this module's copy is only
 * for the letterhead markup it renders itself. */
function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined || value === "" ? "" : String(value)
  return str.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

/** The school letterhead (Administration > System Setup > Print Header),
 * shared by every print output in the app instead of each one hardcoding
 * or guessing at the school's name/address/phone/logo. `enabled` mirrors
 * the caller's own Dialog `open` state, matching every other useQuery in
 * these print-bearing components — the letterhead has no reason to fetch
 * while its dialog is closed. */
export function usePrintHeader(enabled: boolean) {
  return useQuery({
    queryKey: ["SMS Print Header"],
    queryFn: () => frappe.getDoc<PrintHeaderDoc>("SMS Print Header", "SMS Print Header"),
    enabled,
  })
}

/** Guarantees the letterhead data is actually in hand before a print
 * document gets built from it — call this at the top of every
 * handlePrint/openPrintWindow (making it `async` if it wasn't already)
 * instead of reading `usePrintHeader(...).data` directly.
 *
 * The dialog opening and the click that triggers Print can happen close
 * enough together that this query's first fetch hasn't resolved yet by
 * the time the print HTML is built — reading `.data` at that instant
 * silently omits the whole letterhead (logo included) for that one print,
 * even though the exact same print moments later (once the query has
 * settled into cache) renders it correctly. Awaiting here removes that
 * race instead of tolerating it: `.data` is returned immediately if
 * already loaded, otherwise this refetches and waits for it. */
export async function ensurePrintHeader(
  query: UseQueryResult<PrintHeaderDoc>
): Promise<PrintHeaderDoc | undefined> {
  if (query.data) return query.data
  const result = await query.refetch()
  return result.data
}

/** Waits for every &lt;img&gt; in a print window's own document to finish
 * loading (or fail) before returning — call this between
 * `printWindow.document.close()` and `printWindow.print()` in every
 * openPrintWindow. `ensurePrintHeader` above only guarantees the letterhead
 * *metadata* (the logo's URL) is in hand before the print HTML is built;
 * it says nothing about whether the browser has actually finished
 * downloading those image bytes into this popup's DOM. On a cold cache —
 * the first time this exact logo URL is ever requested in the session,
 * e.g. right after opening the app — that fetch can still be in flight
 * when `print()` is called, so the printed page captures the logo box
 * empty. A second print of the same document works because the image is
 * now served from the browser's HTTP cache. This is a plain `<img>`, not
 * the letterhead's own PrintHeaderDoc query, so it's unrelated to
 * `ensurePrintHeader` and must be awaited separately. */
export function waitForImagesToLoad(doc: Document): Promise<void> {
  const images = Array.from(doc.images)
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true })
            img.addEventListener("error", () => resolve(), { once: true })
          })
    )
  ).then(() => undefined)
}

/** CSS for renderLetterhead's markup — inline into each print document's
 * own <style> block (a <link> to a shared stylesheet won't load inside a
 * document.write'd popup with no location of its own). */
export const LETTERHEAD_STYLE = `
  .letterhead { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
  .letterhead .logo { height: 64px; width: 64px; object-fit: contain; flex-shrink: 0; }
  .letterhead .school-name { font-size: 1.1rem; font-weight: bold; text-transform: uppercase; }
  .letterhead .address, .letterhead .phone { font-size: 0.8rem; color: #333; }
`

/** Renders the letterhead block: the logo beside the school name, with
 * address/phone underneath — the same markup for every print output.
 * Returns "" if the settings doc hasn't loaded yet or has no school_name
 * on file, so a print triggered before the query resolves (or a school
 * that hasn't filled in the Print Header setup yet) just omits the
 * letterhead rather than rendering a blank/undefined-looking header. */
export function renderLetterhead(header: PrintHeaderDoc | undefined): string {
  if (!header?.school_name) return ""
  const logoImg = header.logo ? `<img class="logo" src="${escapeHtml(header.logo)}" alt="" />` : ""
  return `
    <div class="letterhead">
      ${logoImg}
      <div>
        <div class="school-name">${escapeHtml(header.school_name)}</div>
        ${header.address ? `<div class="address">${escapeHtml(header.address)}</div>` : ""}
        ${header.phone ? `<div class="phone">${escapeHtml(header.phone)}</div>` : ""}
      </div>
    </div>
  `
}
