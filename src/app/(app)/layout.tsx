import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/finances", label: "Finances" },
  { href: "/manual", label: "Cash" },
  { href: "/chat", label: "Chat" },
  { href: "/bills", label: "Bills" },
  { href: "/schedule", label: "Schedule" },
  { href: "/todos", label: "Todos" },
  { href: "/setup", label: "Setup" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 h-14">
          <Link href="/dashboard" className="font-semibold">
            Assistant
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {navItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-md hover:bg-neutral-100"
              >
                {n.label}
              </Link>
            ))}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="px-3 py-1.5 rounded-md text-neutral-500 hover:bg-neutral-100">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">{children}</main>
    </div>
  );
}
