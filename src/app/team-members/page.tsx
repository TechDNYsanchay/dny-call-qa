import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading, PageHeader, StatTile } from "@/components/ui";
import { listTeamMembers, requireMe } from "@/lib/data";
import { reportsTestInbox } from "@/lib/settings";
import { DeliveryCard, PeopleList } from "./team-editor";

export const metadata = { title: "Team members · DNY Sales Agent" };

export default function TeamMembersPage() {
  return (
    <Suspense fallback={<Loading what="team members" />}>
      <TeamMembers />
    </Suspense>
  );
}

async function TeamMembers() {
  const me = await requireMe();
  if (!me.canSeeAll) redirect("/");
  const [people, testInbox] = await Promise.all([listTeamMembers(), reportsTestInbox()]);
  const active = people.filter((p) => p.active);
  const scored = active.filter((p) => p.role === "executive" || p.role === "consultant");
  return (
    <>
      <PageHeader
        title="Team members"
        subtitle="Calls are matched to people by their Callyzer number (phone) or tl;dv email; an email lets them sign in and get their report."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active people" value={active.length} note={`${people.length - active.length} paused`} />
        <StatTile label="Executives and consultants" value={scored.length} note="their calls are scored" />
        <StatTile label="Phones tracked" value={active.filter((p) => p.callyzerPhone).length} note="Callyzer numbers on the list" />
        <StatTile label="Can sign in" value={active.filter((p) => p.canSignIn).length} note={`of ${active.length} active`} />
      </div>
      <DeliveryCard testInbox={testInbox} myEmail={me.email} />
      <PeopleList people={people} meId={me.id} />
    </>
  );
}
