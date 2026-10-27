"use client";

// The app's navigation. On a laptop: the daily pages as tabs (the current one underlined), the
// rest under "More", then search, install and the account menu. On a phone or tablet: a menu
// button that opens a full-screen menu, grouped by how often each page is used.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { InstallApp } from "@/components/install-app";

export type NavIconName = "team" | "report" | "followups" | "calls" | "leads" | "rollups" | "examples" | "scorecards" | "sheets" | "members";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** One line under the label in the "More" menu and the phone menu. */
  hint: string;
  /** Other path prefixes that count as this page (e.g. a person's report under Team). */
  also?: string[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

interface User {
  name: string;
  title: string;
  email: string | null;
}

interface Props {
  /** The first group is the daily pages, shown as tabs on a laptop; the rest go under "More". */
  groups: NavGroup[];
  user: User;
  /** The latest day with calls, already formatted ("26 Oct 2026"). */
  latest: string | null;
  sample: boolean;
}

const matches = (prefix: string, pathname: string) => (prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`));

/** The page that best matches the address: the longest matching link, so /people/me beats /people. */
function activeHref(groups: NavGroup[], pathname: string): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    for (const prefix of [item.href, ...(item.also ?? [])]) {
      if (matches(prefix, pathname) && (!best || prefix.length > best.length)) best = { href: item.href, length: prefix.length };
    }
  }
  return best?.href ?? null;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const noSubscribe = () => () => {};
/** False on the server and while hydrating, true after: the phone menu renders into <body>. */
const useIsClient = () =>
  useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );

const LAPTOP = "(min-width: 1024px)";

export function AppNav({ groups, user, latest, sample }: Props) {
  const pathname = usePathname();
  const current = activeHref(groups, pathname);
  const [primary, ...rest] = groups;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Moving to another page (a link, or the back button) closes the phone menu.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setMenuOpen(false);
  }

  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  return (
    <>
      {sample && (
        <span className="hidden whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] font-medium sm:inline lg:hidden xl:inline" title={latest ? `Sample data · ${latest}` : "Sample data"}>
          Sample data
        </span>
      )}

      {/* Laptop: tabs and More. */}
      <nav aria-label="Main" className="hidden min-w-0 self-stretch gap-0.5 lg:flex">
        {primary.items.map((item) => (
          <TabLink key={item.href} item={item} active={item.href === current} />
        ))}
        {rest.length > 0 && <MoreMenu groups={rest} current={current} />}
      </nav>

      {/* Laptop: search, install, account. */}
      <div className="ml-auto hidden items-center gap-2 text-xs lg:flex">
        <SearchBox />
        <Link
          href="/search"
          aria-label="Search leads and calls"
          className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground xl:hidden"
        >
          <Icon name="search" />
        </Link>
        <InstallApp />
        <AccountMenu user={user} latest={latest} sample={sample} />
      </div>

      {/* Phone and tablet: search and the menu button. */}
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <Link
          href="/search"
          aria-label="Search leads and calls"
          className="grid size-10 place-items-center rounded-lg text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Icon name="search" />
        </Link>
        <button
          ref={menuButton}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open the menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="-mr-2 grid size-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-foreground/5"
        >
          <Icon name="menu" />
        </button>
      </div>
      <MobileMenu open={menuOpen} onClose={closeMenu} groups={groups} current={current} user={user} latest={latest} sample={sample} />
    </>
  );
}

function Underline({ on }: { on: boolean }) {
  return <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`} />;
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <div className="relative flex items-center">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
          active ? "font-medium text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
        }`}
      >
        {item.label}
      </Link>
      <Underline on={active} />
    </div>
  );
}

/** A popover that closes on a click or focus outside it, or Escape (which returns focus to its button). */
function usePopover() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, box, button };
}

const POPOVER =
  "absolute top-full z-50 rounded-xl border border-border bg-surface p-1.5 shadow-[0_16px_40px_-12px_rgb(0_0_0/0.22)] duration-150 ease-out motion-reduce:transition-none";
// Visible at once on open (so its links can take focus), and hidden only after the fade on close.
const popoverState = (open: boolean) =>
  open
    ? "visible translate-y-0 scale-100 opacity-100 transition-[opacity,translate,scale]"
    : "invisible -translate-y-1 scale-[0.98] opacity-0 transition-[opacity,translate,scale,visibility]";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true">
      <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreMenu({ groups, current }: { groups: NavGroup[]; current: string | null }) {
  const { open, setOpen, box, button } = usePopover();
  const active = groups.some((g) => g.items.some((i) => i.href === current));
  return (
    <div ref={box} className="relative flex items-center">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="more-menu"
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
          active ? "font-medium text-foreground" : open ? "bg-foreground/5 text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
        }`}
      >
        More
        <Chevron open={open} />
      </button>
      <Underline on={active} />
      <div id="more-menu" inert={!open} className={`${POPOVER} left-0 mt-px w-80 origin-top-left ${popoverState(open)}`}>
        {groups.map((g, gi) => (
          <div key={g.title} className={gi > 0 ? "mt-1 border-t border-border pt-1" : ""}>
            <div className="px-2.5 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{g.title}</div>
            {g.items.map((item) => {
              const on = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors ${on ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.04]"}`}
                >
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-lg border transition-colors ${
                      on ? "border-transparent bg-brand text-white" : "border-border bg-background text-muted group-hover:text-foreground"
                    }`}
                  >
                    <Icon name={item.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Search from any page; "/" puts the cursor in it. Wide screens only; narrower ones get an icon. */
function SearchBox() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!input.current || input.current.offsetParent === null) return;
      e.preventDefault();
      input.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form action="/search" role="search" className="relative hidden xl:block">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
        <Icon name="search" small />
      </span>
      <input
        ref={input}
        name="q"
        type="search"
        placeholder="Search leads and calls"
        aria-label="Search leads and calls"
        className="peer h-8 w-60 rounded-lg border border-border bg-background pl-8 pr-8 text-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-foreground/30 focus:shadow-[0_0_0_3px_rgb(0_0_0/0.04)] [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 font-mono text-[0.65rem] leading-4 text-muted peer-focus:opacity-0">
        /
      </kbd>
    </form>
  );
}

function AccountMenu({ user, latest, sample }: { user: User; latest: string | null; sample: boolean }) {
  const { open, setOpen, box, button } = usePopover();
  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`Account: ${user.name}`}
        className={`flex items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground ${
          open ? "bg-foreground/5 text-foreground" : ""
        }`}
      >
        <UserMark name={user.name} />
        <Chevron open={open} />
      </button>
      <div id="account-menu" inert={!open} className={`${POPOVER} right-0 mt-2 w-72 origin-top-right ${popoverState(open)}`}>
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <UserMark name={user.name} large />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email ?? user.title}</div>
          </div>
        </div>
        <dl className="mx-1 mb-1.5 space-y-1 rounded-lg bg-background px-2.5 py-2 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium">{user.title}</dd>
          </div>
          {latest && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{sample ? "Sample data" : "Latest calls"}</dt>
              <dd className="font-medium">{latest}</dd>
            </div>
          )}
        </dl>
        <form action="/auth/signout" method="post" className="border-t border-border pt-1.5">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <Icon name="signout" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function UserMark({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-foreground font-semibold text-background ${large ? "size-10 text-sm" : "size-7 text-[0.68rem]"}`}
    >
      {initials(name)}
    </span>
  );
}

function MobileMenu({
  open,
  onClose,
  groups,
  current,
  user,
  latest,
  sample,
}: {
  open: boolean;
  onClose: (returnFocus: boolean) => void;
  groups: NavGroup[];
  current: string | null;
  user: User;
  latest: string | null;
  sample: boolean;
}) {
  const isClient = useIsClient();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // While open: the page behind doesn't scroll, the close button has focus, Tab stays inside,
  // Escape closes, and widening the window to laptop size closes it (laptops have the tab bar).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(true);
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")].filter(
        (el) => el.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const laptop = window.matchMedia(LAPTOP);
    const onWide = () => {
      if (laptop.matches) onClose(false);
    };
    document.addEventListener("keydown", onKey);
    laptop.addEventListener("change", onWide);
    return () => {
      root.style.overflow = before;
      document.removeEventListener("keydown", onKey);
      laptop.removeEventListener("change", onWide);
    };
  }, [open, onClose]);

  if (!isClient) return null;

  // Each block slides up a moment after the one before it as the menu opens.
  const enter = (step: number) => ({
    className: `transition duration-300 ease-out motion-reduce:transition-none ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`,
    style: { transitionDelay: open ? `${60 + step * 40}ms` : "0ms" },
  });

  return createPortal(
    <div
      ref={dialog}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      inert={!open}
      className={`fixed inset-0 z-[100] flex flex-col bg-background duration-300 ease-out motion-reduce:transition-none lg:hidden ${
        open ? "visible opacity-100 transition-opacity" : "invisible opacity-0 transition-[opacity,visibility]"
      }`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/" onClick={() => onClose(false)} className="flex items-center gap-2 font-semibold tracking-tight">
          <LogoMark />
          Sales Agent
        </Link>
        <button
          ref={closeButton}
          type="button"
          onClick={() => onClose(true)}
          aria-label="Close the menu"
          className={`-mr-1.5 grid size-10 place-items-center rounded-full border border-border bg-surface text-foreground transition duration-300 ease-out hover:bg-foreground/5 active:scale-95 motion-reduce:transition-none ${
            open ? "rotate-0" : "-rotate-90"
          }`}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-4">
        <div className="mx-auto max-w-lg">
          <form action="/search" role="search" onSubmit={() => onClose(false)} {...enter(0)}>
            <div className="relative mb-6">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" />
              </span>
              <input
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="Search leads and calls"
                aria-label="Search leads and calls"
                className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-3 text-base outline-none transition-colors placeholder:text-muted focus:border-foreground/30"
              />
            </div>
          </form>

          {groups.map((g, gi) => (
            <section key={g.title} aria-labelledby={`menu-group-${gi}`} {...enter(gi + 1)}>
              <h2 id={`menu-group-${gi}`} className="mb-2 px-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">
                {g.title}
              </h2>
              <ul className="mb-6 overflow-hidden rounded-2xl border border-border bg-surface">
                {g.items.map((item, i) => {
                  const active = item.href === current;
                  return (
                    <li key={item.href} className={i > 0 ? "border-t border-border" : ""}>
                      <Link
                        href={item.href}
                        onClick={() => onClose(false)}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-16 items-center gap-3.5 px-4 py-3 transition-colors active:bg-foreground/[0.06] ${active ? "bg-foreground/[0.03]" : ""}`}
                      >
                        <span
                          className={`grid size-10 shrink-0 place-items-center rounded-xl transition-colors ${
                            active ? "bg-brand text-white" : "border border-border bg-background text-muted"
                          }`}
                        >
                          <Icon name={item.icon} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.95rem] font-medium leading-snug">{item.label}</span>
                          <span className="block truncate text-xs text-muted">{item.hint}</span>
                        </span>
                        {active ? (
                          <span aria-hidden="true" className="mr-1 size-2 shrink-0 rounded-full bg-brand" />
                        ) : (
                          <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-muted" aria-hidden="true">
                            <path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <section aria-label="Your account" {...enter(groups.length + 1)}>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <UserMark name={user.name} large />
                <div className="min-w-0">
                  <div className="truncate font-medium">{user.name}</div>
                  <div className="truncate text-xs text-muted">
                    {user.title}
                    {user.email ? ` · ${user.email}` : ""}
                  </div>
                </div>
              </div>
              {latest && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${sample ? "bg-warning/15" : "bg-background text-muted"}`}>
                  {sample ? "Sample data · " : "Latest calls: "}
                  <span className="font-medium text-foreground">{latest}</span>
                </div>
              )}
              <InstallApp variant="menu" />
              <form action="/auth/signout" method="post" className="mt-3">
                <button
                  type="submit"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/[0.08]"
                >
                  <Icon name="signout" />
                  Sign out
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function LogoMark() {
  return <span className="grid size-7 place-items-center rounded-md bg-brand text-[0.7rem] font-bold tracking-tight text-white">DNY</span>;
}

const PATHS: Record<NavIconName | "search" | "menu" | "close" | "signout", ReactNode> = {
  team: (
    <>
      <circle cx="6" cy="5.5" r="2.25" />
      <path d="M1.75 13c.4-2.2 2.1-3.5 4.25-3.5s3.85 1.3 4.25 3.5" />
      <path d="M10.5 3.6a2.1 2.1 0 1 1 0 4.1M12 9.7c1.2.4 2 1.6 2.25 3.3" />
    </>
  ),
  report: (
    <>
      <rect x="3" y="1.75" width="10" height="12.5" rx="2" />
      <path d="M5.75 10.75V8.75M8 10.75V5.75M10.25 10.75V7.5" />
    </>
  ),
  followups: (
    <>
      <path d="M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h5" />
      <path d="m10.25 11.5 1.5 1.5 2.5-2.75" />
    </>
  ),
  calls: (
    <path d="M5.6 2.2 4 2c-1 0-1.9.9-1.8 1.9.4 4.9 4.9 9.4 9.8 9.8 1 .1 1.9-.8 1.9-1.8l-.2-1.6c-.1-.5-.5-.9-1-1l-1.8-.4c-.5-.1-.9.1-1.2.4l-.6.7c-1.5-.7-2.7-1.9-3.4-3.4l.7-.6c.4-.3.5-.8.4-1.2L6.6 3.2c-.1-.5-.5-.9-1-1Z" />
  ),
  leads: (
    <>
      <circle cx="8" cy="8" r="5.75" />
      <circle cx="8" cy="8" r="2.75" />
      <circle cx="8" cy="8" r="0.5" fill="currentColor" />
    </>
  ),
  rollups: <path d="M2.5 13.5h11M4.5 11V8.5M8 11V4.5M11.5 11V6.5" />,
  examples: <path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4-2.9-2.8 4-.6Z" />,
  scorecards: (
    <>
      <rect x="3" y="2.5" width="10" height="11.75" rx="2" />
      <path d="M6 2.5V1.75h4v.75M5.75 7h4.5M5.75 10h3" />
    </>
  ),
  sheets: (
    <>
      <path d="M4 1.75h5.5l3 3v9.5H4Z" />
      <path d="M9.25 1.75v3.25h3.25M6.25 8.5h4M6.25 11h4" />
    </>
  ),
  members: (
    <>
      <circle cx="6.5" cy="5.5" r="2.5" />
      <path d="M2 13.5c.4-2.3 2.2-3.75 4.5-3.75 1 0 1.9.3 2.6.8M12 9v4.5M9.75 11.25h4.5" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.75" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  signout: (
    <>
      <path d="M6 2.75H3.75v10.5H6" />
      <path d="M10 5.25 12.75 8 10 10.75M12.5 8H6.5" />
    </>
  ),
};

function Icon({ name, small = false }: { name: keyof typeof PATHS; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={small ? "size-3.5" : "size-[18px]"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
