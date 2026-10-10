import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

const NavContext = createContext<(to: string) => void>(() => {});

/** The current query string, and `go` to push a new URL. Back and Forward update it too. */
export function useLocationSearch(): [string, (to: string) => void] {
  const [search, setSearch] = useState(location.search);
  useEffect(() => {
    const onPop = () => setSearch(location.search);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const go = useCallback((to: string) => {
    history.pushState(null, "", to);
    setSearch(location.search);
  }, []);
  return [search, go];
}

export const NavProvider = ({ go, children }: { go: (to: string) => void; children: ReactNode }) => <NavContext value={go}>{children}</NavContext>;

export const useGo = () => useContext(NavContext);

/** A real link. A plain left click navigates in place; modified clicks (new tab, new window) behave as normal. */
export function Link({ to, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const go = useGo();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    e.preventDefault();
    go(to);
  };
  return <a {...rest} href={to} onClick={onClick} />;
}
