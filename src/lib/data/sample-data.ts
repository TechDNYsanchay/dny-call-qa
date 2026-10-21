// Sample data for building the screens before Callyzer, tl;dv and Supabase are connected.
// Names and calls are invented. Scores are not typed in: they are computed from the sample
// model results with the real scoring code, exactly as live calls will be.

import { finaliseScore, scoringEligibility, type Level } from "@/lib/scoring/compute";
import type { CallMetrics } from "@/lib/scoring/metrics";
import type { CallResult, Evidence, FirstCallResult, VisionCallResult } from "@/lib/scoring/schema";
import type { CallRecord, Person } from "./types";

export const IS_SAMPLE_DATA = true;
export const REPORT_DATE = "2026-10-20";

export const PEOPLE: Person[] = [
  { id: "aisha", name: "Aisha Khan", role: "executive", title: "First Calls Executive" },
  { id: "rohan", name: "Rohan Mehta", role: "executive", title: "First Calls Executive" },
  { id: "neha", name: "Neha Kulkarni", role: "executive", title: "First Calls Executive" },
  { id: "kabir", name: "Kabir Shah", role: "consultant", title: "Lead Consultant, Sales" },
];

/** Average score on the six days before REPORT_DATE, oldest first (sample only). */
export const PREVIOUS_DAYS: Record<string, number[]> = {
  aisha: [78, 82, 80, 85, 84, 88],
  rohan: [70, 66, 72, 61, 68, 64],
  neha: [74, 71, 69, 73, 70, 72],
  kabir: [80, 76, 82, 79, 81, 78],
};

const ev = (at: string, speaker: Evidence["speaker"], quote: string): Evidence => ({ at, speaker, quote });
const area = (level: Level, reason: string, ...evidence: Evidence[]) => ({ level, reason, evidence });

const metrics = (m: Partial<CallMetrics> & Pick<CallMetrics, "durationSec" | "clientShare">): CallMetrics => ({
  agentTalkSec: 0,
  clientTalkSec: 0,
  agentShareFirstHalf: 1 - m.clientShare,
  agentShareOverall: 1 - m.clientShare,
  silencesOver8s: 0,
  longestSilenceSec: 3,
  credentialsSec: 0,
  serviceShareOfAgent: 0,
  ...m,
});

const noCapture: FirstCallResult["capture"] = {
  clientName: null, city: null, email: null, background: null, clientType: null, concept: null, format: null,
  property: null, rbOutlets: null, rbMonthlySales: null, timeline: null, partners: null, aspirationalBrand: null,
  budgetBand: null, leadQuality: null, suggestedRoute: null, vcDateTime: null, caseStudiesMentioned: [],
};

const aishaPune: FirstCallResult = {
  stream: "first_call",
  speakerRoles: { agent: "Speaker A", client: "Speaker B" },
  consent: "stated",
  isRunningBusiness: false,
  areas: {
    opening: area(10, "Introduced herself and DNY, stated the recording, checked it was a good time and used his name.",
      ev("0:04", "agent", "Hello, Pranav ji? Main Aisha bol rahi hoon, DNY Hospitality se. Abhi do minute baat karna theek rahega?")),
    short_precise: area(10, "8:40 long and stayed on the sheet's questions without reading them out.",
      ev("0:58", "agent", "Nice. Toh yeh fresh startup hoga — format cafe, aur food mein kya socha hai?")),
    focus_environment: area(10, "Clear line, no silence over 8 seconds, no interruptions."
      , ev("1:40", "agent", "Property finalise ho gayi hai?")),
    client_engagement: area(10, "Client talked 59% of the time and answered fully.",
      ev("0:27", "client", "Main IT mein hoon, Infosys mein, 9 saal ho gaye. Ab apna cafe start karna hai, specialty coffee wala.")),
    coverage: area(5, "All must-capture areas covered, but the budget answer was left vague and no email was taken.",
      ev("4:35", "client", "Abhi exact nahi pata… 50-60 lakh ke around hoga shayad.")),
    cta: area(10, "Asked for the video call, offered tomorrow at 11 and confirmed on WhatsApp.",
      ev("6:10", "agent", "Kal 11 baje video call rakh lein? Main calendar block karke WhatsApp pe link bhej deti hoon.")),
    compliance: area(10, "No fee, service list or partner company mentioned.",
      ev("6:10", "agent", "Hamare lead consultant aapka concept sunke excited honge.")),
  },
  coverage: [
    { question: "fc01", status: "partly", evidence: [ev("0:04", "agent", "Hello, Pranav ji?")] },
    { question: "fc02", status: "covered", evidence: [ev("0:27", "client", "Main IT mein hoon, Infosys mein, 9 saal ho gaye.")] },
    { question: "fc03", status: "covered", evidence: [ev("0:58", "agent", "Toh yeh fresh startup hoga")] },
    { question: "fc04", status: "covered", evidence: [ev("1:06", "client", "Coffee plus all-day breakfast, kuch bakes. Kothrud mein.")] },
    { question: "fc05", status: "covered", evidence: [ev("1:44", "client", "Haan, 1,200 square feet, ground floor, rent around 1.8 lakh per month.")] },
    { question: "fc06", status: "not_applicable", evidence: [] },
    { question: "fc07", status: "covered", evidence: [ev("2:34", "client", "January end tak open karna hai.")] },
    { question: "fc08", status: "covered", evidence: [ev("3:09", "client", "Meri wife aur main. Final call mera hai.")] },
    { question: "fc09", status: "covered", evidence: [ev("3:44", "client", "Blue Tokai type vibe, but more food-focused.")] },
    { question: "fc10", status: "partly", evidence: [ev("4:35", "client", "Abhi exact nahi pata… 50-60 lakh ke around hoga shayad.")] },
    { question: "fc11", status: "covered", evidence: [ev("6:24", "client", "Kal 11 perfect hai.")] },
  ],
  hardFails: [],
  capture: {
    ...noCapture,
    clientName: "Pranav Joshi",
    city: "Pune",
    background: "IT professional, 9 years at Infosys",
    clientType: "startup",
    concept: "Specialty coffee with all-day breakfast and bakes",
    format: "cafe",
    property: { finalised: true, area: "Kothrud", sizeSqft: 1200, floor: "Ground", rentPerMonthInr: 180000 },
    timeline: "Open by end of January",
    partners: "With his wife; Pranav takes the final call",
    aspirationalBrand: "Blue Tokai",
    budgetBand: "50l_to_1cr",
    leadQuality: "hot",
    suggestedRoute: "south_indian_cafe",
    vcDateTime: "2026-10-21 11:00",
  },
  feedback: {
    strengths: [
      { text: "Checked it was a good time and used the client's name before the first question.", evidence: ev("0:04", "agent", "Abhi do minute baat karna theek rahega?") },
      { text: "Asked for the video call with a specific slot and confirmed it on WhatsApp.", evidence: ev("6:10", "agent", "Kal 11 baje video call rakh lein?") },
    ],
    fixes: [
      {
        text: "Accepted a vague budget without narrowing it to a band.",
        evidence: ev("4:35", "client", "Abhi exact nahi pata… 50-60 lakh ke around hoga shayad."),
        betterLine: "Teen range bataun — 50 lakh se kam, 50 lakh se 1 crore, ya 1 crore se upar — aap kis mein honge?",
      },
      {
        text: "Didn't take an email for the calendar invite.",
        evidence: ev("8:30", "agent", "Done, invite bhej diya. Thank you Pranav ji!"),
        betterLine: "Invite ke liye aapka email ID bata dijiye?",
      },
    ],
    tomorrow: "When the budget answer is vague, offer the three bands from the sheet and let the client pick one.",
  },
};

const rohanHyderabad: FirstCallResult = {
  stream: "first_call",
  speakerRoles: { agent: "Speaker A", client: "Speaker B" },
  consent: "not_stated",
  isRunningBusiness: true,
  areas: {
    opening: area(5, "Introduced himself and DNY but didn't check it was a good time.",
      ev("0:03", "agent", "Hello sir, DNY Hospitality se Rohan. Aapne form bhara tha na?")),
    short_precise: area(5, "Long stretches about DNY's services instead of the client's answers.",
      ev("6:45", "agent", "Sir, DNY ne 550 se zyada brands ke saath kaam kiya hai, hum menu, SOP, training, sab karte hain…")),
    focus_environment: area(5, "Two silences over 8 seconds while typing.",
      ev("8:12", "agent", "Ek minute sir, main note kar raha hoon…")),
    client_engagement: area(5, "Client answered, but talked only 35% of the time.",
      ev("11:42", "client", "Itna? Main sochke batata hoon.")),
    coverage: area(5, "Missed timeline, partners and aspirational brand.",
      ev("1:20", "client", "Do outlets hain Kukatpally aur Madhapur mein, biryani QSR, monthly around 18 lakh sales.")),
    cta: area(5, "Mentioned a call back but booked no video call slot.",
      ev("16:58", "agent", "Theek hai sir, main aapko call back karta hoon.")),
    compliance: area(0, "Quoted a package price on the first call.",
      ev("11:30", "agent", "Hamara package 6.6 lakh ka hai, usme sab cover hota hai.")),
  },
  coverage: [
    { question: "fc01", status: "partly", evidence: [ev("0:03", "agent", "Aapne form bhara tha na?")] },
    { question: "fc02", status: "covered", evidence: [ev("0:40", "client", "Pehle family business tha, ab 6 saal se biryani chala raha hoon.")] },
    { question: "fc03", status: "covered", evidence: [ev("1:20", "client", "Do outlets hain Kukatpally aur Madhapur mein")] },
    { question: "fc04", status: "covered", evidence: [ev("1:20", "client", "biryani QSR")] },
    { question: "fc05", status: "covered", evidence: [ev("2:05", "client", "Teesra outlet ke liye Gachibowli mein 900 square feet dekha hai.")] },
    { question: "fc06", status: "covered", evidence: [ev("1:20", "client", "monthly around 18 lakh sales")] },
    { question: "fc07", status: "missed", evidence: [] },
    { question: "fc08", status: "missed", evidence: [] },
    { question: "fc09", status: "missed", evidence: [] },
    { question: "fc10", status: "partly", evidence: [ev("11:42", "client", "Itna? Main sochke batata hoon.")] },
    { question: "fc11", status: "missed", evidence: [] },
  ],
  hardFails: [{ id: "fee_or_package_quoted", evidence: [ev("11:30", "agent", "Hamara package 6.6 lakh ka hai, usme sab cover hota hai.")] }],
  capture: {
    ...noCapture,
    clientName: "Sameer Reddy",
    city: "Hyderabad",
    background: "Runs a biryani QSR for 6 years",
    clientType: "running_business",
    concept: "Hyderabadi biryani QSR, planning a third outlet",
    format: "qsr",
    property: { finalised: false, area: "Gachibowli", sizeSqft: 900, floor: null, rentPerMonthInr: null },
    rbOutlets: 2,
    rbMonthlySales: "About ₹18 L a month",
    leadQuality: "warm",
    suggestedRoute: "sales_consultant",
  },
  feedback: {
    strengths: [
      { text: "Got the outlet count and monthly sales early in the call.", evidence: ev("1:20", "client", "monthly around 18 lakh sales") },
    ],
    fixes: [
      {
        text: "Quoted a package price on the first call.",
        evidence: ev("11:30", "agent", "Hamara package 6.6 lakh ka hai, usme sab cover hota hai."),
        betterLine: "Fee aur scope hamare lead consultant aapka business samajhne ke baad batayenge — kal 5 baje 20 minute ki video call rakh lein?",
      },
      {
        text: "Spoke about DNY's services for two minutes instead of asking about the client.",
        evidence: ev("6:45", "agent", "hum menu, SOP, training, sab karte hain…"),
        betterLine: "Ek sawaal — abhi aapke outlets mein sabse bada challenge kya lag raha hai?",
      },
    ],
    tomorrow: "Never give a fee on a first call; answer price questions by booking the video call.",
  },
};

const rohanMumbai: FirstCallResult = {
  stream: "first_call",
  speakerRoles: { agent: "Speaker A", client: "Speaker B" },
  consent: "stated",
  isRunningBusiness: false,
  areas: {
    opening: area(10, "Clear introduction, recording stated, checked the time.",
      ev("0:05", "agent", "Hi Ishaan, Rohan from DNY Hospitality. Is this a good time for five minutes? This call is recorded for quality.")),
    short_precise: area(10, "7:05 long and on the main questions.", ev("1:10", "agent", "What kind of bar are you planning — and where?")),
    focus_environment: area(5, "An 11-second silence while typing notes.", ev("3:20", "agent", "Sorry, ek second, main note kar raha hoon…")),
    client_engagement: area(5, "Client was driving and gave short answers; no callback slot offered.", ev("0:12", "client", "Yeah, go ahead, I'm driving though.")),
    coverage: area(5, "Partners and budget were not asked.", ev("2:40", "client", "Bandra mein, around 2,500 square feet, cocktail bar.")),
    cta: area(10, "Booked tomorrow 6 pm and sent the invite on WhatsApp.",
      ev("6:30", "agent", "Kal shaam 6 baje lead consultant ke saath 20 minute? WhatsApp pe invite bhejta hoon.")),
    compliance: area(10, "No fee or partner company mentioned.", ev("6:30", "agent", "Kal shaam 6 baje lead consultant ke saath 20 minute?")),
  },
  coverage: [
    { question: "fc01", status: "covered", evidence: [ev("0:05", "agent", "Hi Ishaan")] },
    { question: "fc02", status: "covered", evidence: [ev("0:50", "client", "I work in investment banking, this is my first F&B project.")] },
    { question: "fc03", status: "covered", evidence: [ev("0:50", "client", "this is my first F&B project")] },
    { question: "fc04", status: "covered", evidence: [ev("2:40", "client", "cocktail bar")] },
    { question: "fc05", status: "covered", evidence: [ev("2:40", "client", "Bandra mein, around 2,500 square feet")] },
    { question: "fc06", status: "not_applicable", evidence: [] },
    { question: "fc07", status: "covered", evidence: [ev("4:05", "client", "March tak launch karna hai.")] },
    { question: "fc08", status: "missed", evidence: [] },
    { question: "fc09", status: "covered", evidence: [ev("4:40", "client", "Something like Bombay Canteen's bar, but louder.")] },
    { question: "fc10", status: "missed", evidence: [] },
    { question: "fc11", status: "covered", evidence: [ev("6:30", "agent", "Kal shaam 6 baje lead consultant ke saath 20 minute?")] },
  ],
  hardFails: [],
  capture: {
    ...noCapture,
    clientName: "Ishaan Kapoor",
    city: "Mumbai",
    background: "Investment banker, first F&B project",
    clientType: "startup",
    concept: "Cocktail bar",
    format: "bar",
    property: { finalised: true, area: "Bandra", sizeSqft: 2500, floor: null, rentPerMonthInr: null },
    timeline: "Launch by March",
    aspirationalBrand: "The Bombay Canteen",
    leadQuality: "warm",
    suggestedRoute: "bar",
    vcDateTime: "2026-10-21 18:00",
  },
  feedback: {
    strengths: [
      { text: "Opened cleanly and stated the recording.", evidence: ev("0:05", "agent", "Is this a good time for five minutes? This call is recorded for quality.") },
      { text: "Booked a specific video call slot.", evidence: ev("6:30", "agent", "Kal shaam 6 baje lead consultant ke saath 20 minute?") },
    ],
    fixes: [
      {
        text: "Didn't ask the budget.",
        evidence: ev("6:30", "agent", "Kal shaam 6 baje lead consultant ke saath 20 minute?"),
        betterLine: "Overall project ka budget roughly kis range mein hai — 50 lakh se kam, 50 lakh se 1 crore, ya 1 crore se upar?",
      },
      {
        text: "Went silent for 11 seconds while typing.",
        evidence: ev("3:20", "agent", "Sorry, ek second, main note kar raha hoon…"),
        betterLine: "Got it — aur launch kab tak plan kar rahe hain? (keep notes to one or two words during the call)",
      },
    ],
    tomorrow: "Ask the budget with the three bands before you ask for the video call.",
  },
};

const nehaNashik: FirstCallResult = {
  stream: "first_call",
  speakerRoles: { agent: "Speaker A", client: "Speaker B" },
  consent: "stated",
  isRunningBusiness: false,
  areas: {
    opening: area(10, "Warm opening, name used, recording stated.", ev("0:04", "agent", "Namaste Meera ji, Neha from DNY Hospitality. Yeh call record ho rahi hai — abhi baat kar sakte hain?")),
    short_precise: area(5, "10:15 long; drilled into kitchen equipment details.", ev("6:20", "agent", "Aur kitchen mein kaunse burners aur fryer lagenge, kitne litre ka?")),
    focus_environment: area(5, "A colleague's voice interrupted twice.", ev("4:02", "agent", "Haan, ek second… sorry Meera ji, office mein thoda shor hai.")),
    client_engagement: area(5, "Client gave one-word answers in the second half.", ev("7:30", "client", "Haan.")),
    coverage: area(10, "Every must-capture question covered by meaning.", ev("5:10", "client", "Budget around 40 lakh hai, apne paise se.")),
    cta: area(5, "Asked for the video call but accepted 'this week sometime' without a slot.",
      ev("9:40", "client", "Is week mein kabhi bhi kar lete hain.")),
    compliance: area(10, "No fee or services pitched.", ev("9:40", "agent", "Hamare lead consultant aapse baat karna chahenge.")),
  },
  coverage: [
    { question: "fc01", status: "covered", evidence: [ev("0:04", "agent", "Namaste Meera ji")] },
    { question: "fc02", status: "covered", evidence: [ev("0:30", "client", "Main real estate mein invest karti hoon, F&B naya hai.")] },
    { question: "fc03", status: "covered", evidence: [ev("0:30", "client", "Main real estate mein invest karti hoon")] },
    { question: "fc04", status: "covered", evidence: [ev("1:20", "client", "Cloud kitchen, North Indian aur Chinese.")] },
    { question: "fc05", status: "covered", evidence: [ev("2:10", "client", "Nashik Road pe 600 square feet ka space hai.")] },
    { question: "fc06", status: "not_applicable", evidence: [] },
    { question: "fc07", status: "covered", evidence: [ev("3:00", "client", "December mein start karna hai.")] },
    { question: "fc08", status: "covered", evidence: [ev("3:30", "client", "Main akeli hoon.")] },
    { question: "fc09", status: "missed", evidence: [] },
    { question: "fc10", status: "covered", evidence: [ev("5:10", "client", "Budget around 40 lakh hai, apne paise se.")] },
    { question: "fc11", status: "partly", evidence: [ev("9:40", "client", "Is week mein kabhi bhi kar lete hain.")] },
  ],
  hardFails: [],
  capture: {
    ...noCapture,
    clientName: "Meera Desai",
    city: "Nashik",
    background: "Real estate investor, new to F&B",
    clientType: "investor",
    concept: "North Indian and Chinese cloud kitchen",
    format: "cloud_kitchen",
    property: { finalised: true, area: "Nashik Road", sizeSqft: 600, floor: null, rentPerMonthInr: null },
    timeline: "Start in December",
    partners: "Solo",
    budgetBand: "under_50l",
    leadQuality: "warm",
    suggestedRoute: "sales_consultant",
  },
  feedback: {
    strengths: [
      { text: "Covered every mandatory question, including the budget.", evidence: ev("5:10", "client", "Budget around 40 lakh hai, apne paise se.") },
      { text: "Stated the recording and asked permission to talk.", evidence: ev("0:04", "agent", "Yeh call record ho rahi hai — abhi baat kar sakte hain?") },
    ],
    fixes: [
      {
        text: "Accepted 'this week sometime' instead of a slot.",
        evidence: ev("9:40", "client", "Is week mein kabhi bhi kar lete hain."),
        betterLine: "Kal 4 baje ya Thursday 11 baje — kaunsa better rahega? Main abhi block kar deti hoon.",
      },
      {
        text: "Drilled into equipment details that belong on the video call.",
        evidence: ev("6:20", "agent", "Aur kitchen mein kaunse burners aur fryer lagenge, kitne litre ka?"),
        betterLine: "Kitchen ki details hamare consultant video call pe aapke saath plan karenge.",
      },
    ],
    tomorrow: "Always offer two specific slots for the video call and book one before you hang up.",
  },
};

const kabirVc: VisionCallResult = {
  stream: "vision_call",
  speakerRoles: { agent: "Kabir Shah", client: "Arjun Malhotra" },
  isRunningBusiness: false,
  areas: {
    relationship_first: area(10, "First nine minutes on the client's story; credentials took 1:30.",
      ev("0:45", "agent", "Arjun, before anything about us — what made you want to build a restaurant brand now?")),
    interest_specificity: area(5, "Got the capex and sales target, but accepted a vague answer on staffing.",
      ev("22:15", "client", "Team toh mil hi jayegi, dekh lenge.")),
    value_over_pitch: area(5, "Shared one case study tied to the concept; service talk ran to 24% of his time.",
      ev("31:10", "agent", "So our H01 covers market research, then menu engineering, SOPs, training, launch…")),
    listening_presence: area(10, "Summarised back the client's three worries and didn't re-ask first-call basics.",
      ev("18:40", "agent", "So the three things worrying you are weekday footfall, food cost and finding a GM — did I get that right?")),
    closing: area(10, "Fixed the proposal date, the review call and a founder round two.",
      ev("49:30", "agent", "Proposal by Friday the 24th, review call Monday the 27th at 4, and a founder will join that one.")),
    compliance: area(10, "Standard scope language, no promised outcomes.",
      ev("33:00", "agent", "We'll agree the milestones in the proposal — variance report in 15 days is the first one.")),
  },
  coverage: [
    { question: "lc01", status: "covered", evidence: [ev("2:10", "client", "Teen saal mein Pune mein 3 aur Mumbai mein 1 outlet.")] },
    { question: "lc02", status: "covered", evidence: [ev("1:05", "client", "15 saal corporate mein, ab apna kuch banana hai.")] },
    { question: "lc03", status: "covered", evidence: [ev("4:30", "client", "SodaBottleOpenerWala — the fun, the price point.")] },
    { question: "lc04", status: "covered", evidence: [ev("12:00", "client", "Young families, weekend lunch, aur office crowd weekdays.")] },
    { question: "lc05", status: "partly", evidence: [ev("15:20", "client", "Roughly 35 lakh a month per outlet, once settled.")] },
    { question: "lc06", status: "covered", evidence: [ev("18:40", "agent", "So the three things worrying you are weekday footfall, food cost and finding a GM")] },
    { question: "lc07", status: "not_applicable", evidence: [] },
    { question: "lc08", status: "partly", evidence: [ev("22:15", "client", "Team toh mil hi jayegi, dekh lenge.")] },
    { question: "lc09", status: "covered", evidence: [ev("27:40", "client", "1.2 crore including working capital.")] },
    { question: "lc10", status: "missed", evidence: [] },
    { question: "lc11", status: "covered", evidence: [ev("44:10", "client", "Food cost under 32% in the first six months.")] },
    { question: "lc12", status: "covered", evidence: [ev("49:30", "agent", "Proposal by Friday the 24th, review call Monday the 27th at 4")] },
    { question: "lc13", status: "covered", evidence: [ev("47:00", "client", "Branding ke liye bhi help chahiye.")] },
  ],
  topics: [
    { from: "0:00", to: "9:00", topic: "client_story" },
    { from: "9:00", to: "10:30", topic: "dny_credentials" },
    { from: "10:30", to: "28:00", topic: "other" },
    { from: "28:00", to: "36:00", topic: "services" },
    { from: "36:00", to: "52:00", topic: "other" },
  ],
  hardFails: [],
  capture: {
    answers: {
      lc01: "3 outlets in Pune and 1 in Mumbai within three years",
      lc02: "15 years in corporate; wants to build his own brand",
      lc03: "SodaBottleOpenerWala: the fun and the price point",
      lc04: "Young families at weekend lunch; office crowd on weekdays",
      lc05: "About ₹35 L a month per outlet once settled",
      lc06: "Weekday footfall, food cost, finding a GM",
      lc07: null,
      lc08: "Not decided; expects to hire",
      lc09: "₹1.2 Cr including working capital",
      lc10: null,
      lc11: "Food cost under 32% in the first six months",
      lc12: "Proposal 24 Oct; review call 27 Oct, 4 pm",
      lc13: "Branding",
    },
    stageRecommendation: { stage: 2, reason: "₹1.2 Cr project, corporate professional with a multi-outlet vision" },
    packageSuggestion: "Fast casual package at the Stage 2 list, with the financial model",
    caseStudiesDiscussed: ["Kalaburagi hotel F&B"],
    challengesToHeads: [{ challenge: "Weekday footfall at the chosen location", head: "H01" }],
    proposalDate: "2026-10-24",
    reviewCallDate: "2026-10-27",
    founderRoundTwo: true,
    partnerNeeds: ["brand"],
  },
  feedback: {
    strengths: [
      { text: "Spent the first nine minutes on the client's story before any DNY talk.", evidence: ev("0:45", "agent", "Arjun, before anything about us — what made you want to build a restaurant brand now?") },
      { text: "Left with both dates and a founder round two.", evidence: ev("49:30", "agent", "Proposal by Friday the 24th, review call Monday the 27th at 4, and a founder will join that one.") },
    ],
    fixes: [
      {
        text: "Service talk ran to 24% of your time; the limit is 20%.",
        evidence: ev("31:10", "agent", "So our H01 covers market research, then menu engineering, SOPs, training, launch…"),
        betterLine: "You said finding a GM worries you most — at Kalaburagi we solved that by…",
      },
      {
        text: "Didn't ask which agencies are already hired.",
        evidence: ev("27:40", "client", "1.2 crore including working capital."),
        betterLine: "Interior, branding ya kitchen design ke liye kisi agency ko already onboard kiya hai?",
      },
    ],
    tomorrow: "Let services come up only as answers to the challenges the client named.",
  },
};

interface SampleCall extends Omit<CallRecord, "final" | "notScored"> {
  result?: CallResult;
}

const SAMPLE_CALLS: SampleCall[] = [
  {
    id: "c-101", stream: "first_call", personId: "aisha", startedAt: "2026-10-20T10:12:00+05:30", durationSec: 520,
    client: { name: "Pranav Joshi", city: "Pune" }, recordingStatus: "available",
    metrics: metrics({ durationSec: 520, clientShare: 0.59, agentTalkSec: 190, clientTalkSec: 272, agentShareFirstHalf: 0.44 }),
    result: aishaPune,
    transcript: [
      { role: "agent", startSec: 4, endSec: 13, text: "Hello, Pranav ji? Main Aisha bol rahi hoon, DNY Hospitality se. Yeh call quality ke liye record ho rahi hai. Abhi do minute baat karna theek rahega?" },
      { role: "client", startSec: 14, endSec: 17, text: "Haan haan, boliye, abhi free hoon." },
      { role: "agent", startSec: 20, endSec: 26, text: "Thank you. Pehle thoda aapke baare mein bataiye — aap abhi kya kar rahe hain?" },
      { role: "client", startSec: 27, endSec: 55, text: "Main IT mein hoon, Infosys mein, 9 saal ho gaye. Ab apna cafe start karna hai, specialty coffee wala." },
      { role: "agent", startSec: 58, endSec: 65, text: "Nice. Toh yeh fresh startup hoga — format cafe, aur food mein kya socha hai?" },
      { role: "client", startSec: 66, endSec: 98, text: "Coffee plus all-day breakfast, kuch bakes. Kothrud mein." },
      { role: "agent", startSec: 100, endSec: 103, text: "Property finalise ho gayi hai?" },
      { role: "client", startSec: 104, endSec: 140, text: "Haan, 1,200 square feet, ground floor, rent around 1.8 lakh per month." },
      { role: "agent", startSec: 150, endSec: 153, text: "Aur start kab tak karna chahte hain?" },
      { role: "client", startSec: 154, endSec: 180, text: "January end tak open karna hai." },
      { role: "agent", startSec: 185, endSec: 189, text: "Partners hain ya aap solo kar rahe hain?" },
      { role: "client", startSec: 189, endSec: 215, text: "Meri wife aur main. Final call mera hai." },
      { role: "agent", startSec: 220, endSec: 224, text: "Koi aspirational brand hai jaisa aap banana chahte ho?" },
      { role: "client", startSec: 224, endSec: 265, text: "Blue Tokai type vibe, but more food-focused." },
      { role: "agent", startSec: 270, endSec: 274, text: "Budget roughly kitna socha hai overall project ka?" },
      { role: "client", startSec: 275, endSec: 300, text: "Abhi exact nahi pata… 50-60 lakh ke around hoga shayad." },
      { role: "agent", startSec: 370, endSec: 383, text: "Pranav ji, hamare lead consultant aapka concept sunke excited honge. Kal 11 baje video call rakh lein? Main calendar block karke WhatsApp pe link bhej deti hoon." },
      { role: "client", startSec: 384, endSec: 386, text: "Kal 11 perfect hai." },
      { role: "agent", startSec: 510, endSec: 514, text: "Done, invite bhej diya. Thank you Pranav ji!" },
    ],
  },
  {
    id: "c-102", stream: "first_call", personId: "aisha", startedAt: "2026-10-20T11:40:00+05:30", durationSec: 95,
    client: { name: "Unknown caller", city: "Thane" }, recordingStatus: "available", transcript: [],
  },
  {
    id: "c-103", stream: "first_call", personId: "aisha", startedAt: "2026-10-20T15:05:00+05:30", durationSec: 370,
    client: { name: "Farah Siddiqui", city: "Lucknow" }, recordingStatus: "missing", transcript: [],
  },
  {
    id: "c-104", stream: "first_call", personId: "rohan", startedAt: "2026-10-20T10:30:00+05:30", durationSec: 1040,
    client: { name: "Sameer Reddy", city: "Hyderabad" }, recordingStatus: "available",
    metrics: metrics({ durationSec: 1040, clientShare: 0.35, agentTalkSec: 610, clientTalkSec: 330, agentShareFirstHalf: 0.62, silencesOver8s: 2, longestSilenceSec: 11 }),
    result: rohanHyderabad,
    transcript: [
      { role: "agent", startSec: 3, endSec: 8, text: "Hello sir, DNY Hospitality se Rohan. Aapne form bhara tha na?" },
      { role: "client", startSec: 9, endSec: 10, text: "Haan, bolo." },
      { role: "client", startSec: 80, endSec: 95, text: "Do outlets hain Kukatpally aur Madhapur mein, biryani QSR, monthly around 18 lakh sales." },
      { role: "agent", startSec: 405, endSec: 530, text: "Sir, DNY ne 550 se zyada brands ke saath kaam kiya hai, hum menu, SOP, training, sab karte hain…" },
      { role: "agent", startSec: 690, endSec: 698, text: "Hamara package 6.6 lakh ka hai, usme sab cover hota hai." },
      { role: "client", startSec: 702, endSec: 705, text: "Itna? Main sochke batata hoon." },
      { role: "agent", startSec: 1018, endSec: 1022, text: "Theek hai sir, main aapko call back karta hoon." },
    ],
  },
  {
    id: "c-105", stream: "first_call", personId: "rohan", startedAt: "2026-10-20T16:45:00+05:30", durationSec: 425,
    client: { name: "Ishaan Kapoor", city: "Mumbai" }, recordingStatus: "available",
    metrics: metrics({ durationSec: 425, clientShare: 0.46, agentTalkSec: 180, clientTalkSec: 155, silencesOver8s: 1, longestSilenceSec: 11 }),
    result: rohanMumbai,
    transcript: [
      { role: "agent", startSec: 5, endSec: 11, text: "Hi Ishaan, Rohan from DNY Hospitality. Is this a good time for five minutes? This call is recorded for quality." },
      { role: "client", startSec: 12, endSec: 14, text: "Yeah, go ahead, I'm driving though." },
      { role: "client", startSec: 160, endSec: 172, text: "Bandra mein, around 2,500 square feet, cocktail bar." },
      { role: "agent", startSec: 200, endSec: 203, text: "Sorry, ek second, main note kar raha hoon…" },
      { role: "agent", startSec: 390, endSec: 398, text: "Kal shaam 6 baje lead consultant ke saath 20 minute? WhatsApp pe invite bhejta hoon." },
    ],
  },
  {
    id: "c-106", stream: "first_call", personId: "neha", startedAt: "2026-10-20T12:20:00+05:30", durationSec: 615,
    client: { name: "Meera Desai", city: "Nashik" }, recordingStatus: "available",
    metrics: metrics({ durationSec: 615, clientShare: 0.41, agentTalkSec: 300, clientTalkSec: 210, silencesOver8s: 0 }),
    result: nehaNashik,
    transcript: [
      { role: "agent", startSec: 4, endSec: 10, text: "Namaste Meera ji, Neha from DNY Hospitality. Yeh call record ho rahi hai — abhi baat kar sakte hain?" },
      { role: "client", startSec: 30, endSec: 40, text: "Main real estate mein invest karti hoon, F&B naya hai." },
      { role: "client", startSec: 310, endSec: 316, text: "Budget around 40 lakh hai, apne paise se." },
      { role: "agent", startSec: 380, endSec: 388, text: "Aur kitchen mein kaunse burners aur fryer lagenge, kitne litre ka?" },
      { role: "client", startSec: 580, endSec: 584, text: "Is week mein kabhi bhi kar lete hain." },
    ],
  },
  {
    id: "c-107", stream: "first_call", personId: "neha", startedAt: "2026-10-20T17:10:00+05:30", durationSec: 300,
    client: { name: "Varun Iyer", city: "Bengaluru" }, recordingStatus: "declined", transcript: [],
  },
  {
    id: "c-108", stream: "vision_call", personId: "kabir", startedAt: "2026-10-20T14:00:00+05:30", durationSec: 3120,
    client: { name: "Arjun Malhotra", city: "Pune" }, recordingStatus: "available",
    metrics: metrics({ durationSec: 3120, clientShare: 0.48, agentTalkSec: 1450, clientTalkSec: 1340, agentShareFirstHalf: 0.41, credentialsSec: 90, serviceShareOfAgent: 0.24 }),
    result: kabirVc,
    transcript: [
      { role: "agent", startSec: 45, endSec: 52, text: "Arjun, before anything about us — what made you want to build a restaurant brand now?", topic: "client_story" },
      { role: "client", startSec: 65, endSec: 120, text: "15 saal corporate mein, ab apna kuch banana hai.", topic: "client_story" },
      { role: "agent", startSec: 1120, endSec: 1130, text: "So the three things worrying you are weekday footfall, food cost and finding a GM — did I get that right?" },
      { role: "agent", startSec: 1870, endSec: 1890, text: "So our H01 covers market research, then menu engineering, SOPs, training, launch…", topic: "services" },
      { role: "agent", startSec: 2970, endSec: 2985, text: "Proposal by Friday the 24th, review call Monday the 27th at 4, and a founder will join that one." },
    ],
  },
];

const levelsOf = (result: CallResult) =>
  Object.fromEntries(Object.entries(result.areas).map(([id, a]) => [id, a.level])) as Record<string, Level>;

export const CALLS: CallRecord[] = SAMPLE_CALLS.map((call) => {
  const eligibility = scoringEligibility(call);
  if (!eligibility.eligible) return { ...call, result: undefined, notScored: eligibility.reason };
  if (!call.result || !call.metrics) throw new Error(`Sample call ${call.id} is eligible but has no result`);
  const final = finaliseScore(
    call.stream,
    { levels: levelsOf(call.result), hardFails: call.result.hardFails.map((h) => h.id) },
    call.metrics,
  );
  return { ...call, final };
});
