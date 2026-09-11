import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function toQueryString(searchParams: SearchParams | undefined) {
  if (!searchParams) return "";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item == null) return;
        params.append(key, String(item));
      });
      continue;
    }
    if (value == null) continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function PackagesRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const query = toQueryString(resolved);
  redirect(`https://www.ieltscambridge.com/packages${query}`);
}
