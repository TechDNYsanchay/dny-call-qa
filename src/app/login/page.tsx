import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · DNY Sales Agent" };

const NOTICES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Send yourself a new one.",
  "no-access": "Your account isn't on the DNY team list, or was removed from it. Ask an admin to add you.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto mt-6 max-w-sm sm:mt-16">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted">We&apos;ll email you a one-time link. No password needed.</p>
      <Suspense fallback={<LoginForm next="/" />}>
        <LoginFields searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginFields({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  return <LoginForm next={next} notice={notice} />;
}
