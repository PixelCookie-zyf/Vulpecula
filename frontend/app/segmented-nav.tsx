import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/vault", label: "Vault" },
  { href: "/tools", label: "Tools" },
] as const;

export function SegmentedNav({ activeHref }: { activeHref: string }) {
  return (
    <nav className="site-nav" aria-label="Primary navigation">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === activeHref ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
