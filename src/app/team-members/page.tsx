import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/ui";
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
  const active = people.filter((p) => p.active).length;
  return (
    <>
      <PageHeader
        title="Team members"
        subtitle={`${active} active, ${people.length - active} paused. Calls are matched to people by their Callyzer number (phone) or tl;dv email; an email lets them sign in and get their report.`}
      />
      <DeliveryCard testInbox={testInbox} myEmail={me.email} />
      <PeopleList people={people} meId={me.id} />
    </>
  );
}
