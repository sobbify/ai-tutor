import { memo, type CSSProperties } from "react";
import { Link } from "react-router";
import { t } from "@/i18n";
import { cn } from "@/lib/cn";
import type { MomentProgress } from "@/types/tutor";
import { CheckIcon, ChevronRightIcon, LockIcon, MicIcon } from "@/components/ui/Icons";
import { Face } from "@/features/conversation/Portrait";
import { buildLectures, momentHref, type Lecture, type PathNode } from "./path";

/**
 * The programme as lectures, Duolingo-style. The lecture she is on opens up: a coloured lecture
 * card, then chunky round steps for its two parts (Learn, then the role-play) that wind left and
 * right, a bobbing "Start" bubble with a ring for lines done, and the lecture's reward chest.
 * ELSA cheers from beside the path. Every other lecture is a one-line row: done, ready or locked.
 */
interface Palette {
  fill: string; // step colour (icons on white)
  lip: string; // the 3D edge under a step
  banner: string; // card background (white text passes AA); also the START tag text in light mode
  tagDark: string; // START tag text on the dark surface (passes AA)
}

const BLUE: Palette = {
  fill: "#1f92fc",
  lip: "#1574cc",
  banner: "#126bc0",
  tagDark: "#5cb0ff",
};
/** One colour per lecture (repeats after five). */
const LECTURE_COLOURS: Palette[] = [
  BLUE,
  { fill: "#7c45d6", lip: "#5a2fa6", banner: "#6b38c4", tagDark: "#b590f5" },
  { fill: "#e0336f", lip: "#b0204f", banner: "#c8285e", tagDark: "#ff86ad" },
  { fill: "#23b357", lip: "#178a41", banner: "#0b7a55", tagDark: "#5fd99a" },
  { fill: "#f59e0b", lip: "#c07a08", banner: "#a85a08", tagDark: "#fcc163" },
];
const coloursFor = (n: number) => LECTURE_COLOURS[(n - 1) % LECTURE_COLOURS.length] ?? BLUE;

/** Sideways sway of each step, as a fraction of the widest swing. */
const WIGGLE = [-0.68, 0.68, -0.3];
/**
 * The widest swing shrinks on narrow phones so captions and ELSA always fit:
 * 82px from a 432px-wide path, down to 30px on a 360px phone (cqw = path width).
 */
const SWING = "clamp(0px, 50cqw - 134px, 82px)";
const ELSA = { name: "ELSA", role: "Coach", initials: "EL", posterUrl: null };

export const ProgrammePath = memo(function ProgrammePath({
  moments,
}: {
  moments: MomentProgress[];
}) {
  const lectures = buildLectures(moments);
  const allDone = lectures.length > 0 && lectures.every((l) => l.state === "done");
  const certificate = lectures[lectures.length - 1]?.nodes.find((n) => n.kind === "chest");
  return (
    <section aria-label={t.path.label} className="mt-2 flex flex-col gap-2.5 px-4 pb-4">
      {lectures.map((lecture) =>
        lecture.state === "active" ? (
          <ActiveLecture key={lecture.moment.id} lecture={lecture} colours={coloursFor(lecture.number)} />
        ) : (
          <LectureRow key={lecture.moment.id} lecture={lecture} colours={coloursFor(lecture.number)} />
        ),
      )}
      {allDone && certificate?.to && (
        <ol className="@container relative mt-4 flex flex-col items-center">
          <Step node={{ ...certificate, label: t.lecture.allDone, sub: t.lecture.allDoneSub }} colours={BLUE} x={0} cheer="done" />
        </ol>
      )}
    </section>
  );
});

/** The lecture she is on: its card, both parts and its reward. */
function ActiveLecture({ lecture, colours }: { lecture: Lecture; colours: Palette }) {
  return (
    <div className="my-2">
      <LectureCard lecture={lecture} colours={colours} />
      <ol className="@container relative mt-6 flex flex-col items-center gap-[30px] pb-2">
        {lecture.nodes.map((node, i) => (
          <Step
            key={node.key}
            node={node}
            colours={colours}
            x={WIGGLE[i % WIGGLE.length] ?? 0}
            cheer={node.state === "current" ? "go" : null}
          />
        ))}
      </ol>
    </div>
  );
}

function LectureCard({ lecture, colours }: { lecture: Lecture; colours: Palette }) {
  const m = lecture.moment;
  return (
    <header className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 text-white shadow-soft" style={{ background: colours.banner }}>
      <span className="flex h-[54px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-black/15" aria-hidden="true">
        <span className="text-[9.5px] leading-3 font-extrabold tracking-[0.1em]">{t.lecture.tile}</span>
        <span className="text-[22px] leading-[26px] font-black">{String(lecture.number).padStart(2, "0")}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-4 font-extrabold tracking-[0.08em] uppercase">
          {t.lecture.of(lecture.number, lecture.total)}
          {lecture.final && ` · ${t.lecture.final}`}
        </p>
        <h3 className="text-[17px] leading-[22px] font-extrabold break-words">{m.title}</h3>
        <p className="mt-px text-[12.5px] leading-4 font-semibold opacity-90">
          {m.characterName ? t.lecture.withWho(m.characterName) : t.lecture.twoParts}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-black/15 px-2.5 py-1 text-[12.5px] font-extrabold whitespace-nowrap">
        {t.lecture.parts(lecture.partsDone)}
      </span>
    </header>
  );
}

/** Any other lecture, on one line: done (to its summary), ready (to its next step) or locked. */
function LectureRow({ lecture, colours }: { lecture: Lecture; colours: Palette }) {
  const m = lecture.moment;
  const done = lecture.state === "done";
  const locked = lecture.state === "locked";
  const to = momentHref(m);
  const stateWord = done ? t.lecture.done : locked ? t.lecture.locked : t.lecture.ready;
  const body = (
    <>
      <span
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-[12px]", locked && "bg-[var(--path-off)] text-ink-2")}
        style={locked ? undefined : { background: colours.banner, color: "#fff" }}
        aria-hidden="true"
      >
        {done ? <CheckIcon size={20} strokeWidth={3.2} /> : <span className="text-[16px] font-black">{String(lecture.number).padStart(2, "0")}</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11.5px] leading-[15px] font-extrabold tracking-[0.06em] text-ink-2 uppercase">
          {t.lecture.name(lecture.number)}
          <span className="sr-only">: </span>
        </span>
        <span className={cn("text-[15px] leading-5 font-bold break-words", locked ? "text-ink-2" : "text-ink")}>
          {m.title}
          <span className="sr-only">, </span>
        </span>
      </span>
      {done ? (
        <span className="shrink-0 rounded-full bg-ok-bg px-2.5 py-0.5 text-[12.5px] font-bold text-ok">{t.lecture.done}</span>
      ) : (
        <>
          <span className="sr-only">{stateWord}</span>
          {locked ? (
            <LockIcon size={18} className="shrink-0 text-[var(--path-off-ink)]" />
          ) : (
            <ChevronRightIcon size={18} className="shrink-0 text-ink-2" />
          )}
        </>
      )}
    </>
  );
  const cls = "flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3 py-2.5";
  const label = t.lecture.rowA11y(lecture.number, m.title, stateWord);
  return to ? (
    <Link viewTransition to={to} className={cn(cls, "hover:bg-sky/20")}>
      {body}
    </Link>
  ) : (
    <div role="img" aria-label={label} className={cls}>
      <span className="contents" aria-hidden="true">
        {body}
      </span>
    </div>
  );
}

function Step({
  node,
  colours,
  x,
  cheer,
}: {
  node: PathNode;
  colours: Palette;
  x: number;
  cheer: "go" | "done" | null;
}) {
  const captionLeft = x > 0;
  const swing = `${Math.abs(x)} * ${SWING}`;
  // The progress ring sticks out 14px around the current step, so keep labels clear of it.
  const gap = node.state === "current" ? 22 : 12;
  const state = t.path.states[node.state] ?? node.state;
  const name = [
    node.moment ? node.moment.title : null,
    node.label,
    node.sub,
    state,
  ]
    .filter(Boolean)
    .join(", ");
  const style = {
    transform: `translateX(calc(${x} * ${SWING}))`,
  } as CSSProperties;

  const visual =
    node.kind === "chest" ? (
      <Chest open={node.state === "done"} />
    ) : (
      <Bubble node={node} colours={colours} />
    );
  const box = cn(
    "relative flex justify-center",
    node.kind === "chest"
      ? "size-[84px] items-center"
      : "size-[76px] items-start",
  );

  return (
    <li
      className={cn(
        "relative flex w-full justify-center",
        node.state === "current" && "mt-12",
      )}
      style={{ zIndex: node.state === "current" ? 2 : 1 }}
    >
      <div className="relative" style={style}>
        {node.state === "current" && (
          <StartTag
            colours={colours}
            label={
              node.moment?.status === "in_progress"
                ? t.path.continue
                : t.path.start
            }
          />
        )}
        {node.to ? (
          <Link
            viewTransition
            to={node.to}
            aria-label={name}
            className={cn(box, "group rounded-full")}
          >
            {visual}
          </Link>
        ) : (
          <div role="img" aria-label={name} className={box}>
            {visual}
          </div>
        )}
        <span
          aria-hidden="true"
          style={{
            width: `min(150px, calc(50cqw + ${swing} - ${gap + 40}px))`,
            [captionLeft ? "right" : "left"]: `calc(100% + ${gap}px)`,
          }}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 leading-tight",
            captionLeft ? "text-right" : "text-left",
          )}
        >
          <span
            className={cn(
              "block text-[14.5px] font-extrabold",
              node.state === "locked" ? "text-ink-2" : "text-ink",
            )}
          >
            {node.label}
          </span>
          {node.sub && (
            <span className="mt-0.5 block text-[12.5px] font-semibold text-ink-2">
              {node.sub}
            </span>
          )}
        </span>
        {cheer && (
          <Cheer
            side={captionLeft ? "right" : "left"}
            done={cheer === "done"}
          />
        )}
      </div>
    </li>
  );
}

/** A chunky round step with a 3D lip, like Duolingo's lesson buttons. */
function Bubble({ node, colours }: { node: PathNode; colours: Palette }) {
  const lit = node.state === "done" || node.state === "current";
  const Icon = node.kind === "learn" ? BookStep : MicIcon;
  const r = 47;
  const ring = 2 * Math.PI * r;
  return (
    <>
      {node.state === "current" && (
        // Centred on the whole button (face + lip), with a clear gap all round, and it never moves.
        <svg
          viewBox="0 0 104 104"
          className="pointer-events-none absolute top-1/2 left-1/2 size-[104px] -translate-1/2 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="52"
            cy="52"
            r={r}
            fill="none"
            stroke="var(--path-track)"
            strokeWidth="7"
          />
          {node.progress > 0 && (
            <circle
              cx="52"
              cy="52"
              r={r}
              fill="none"
              stroke={colours.fill}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${ring * node.progress} ${ring}`}
            />
          )}
        </svg>
      )}
      <span
        className="relative flex size-[70px] items-center justify-center rounded-full shadow-[0_6px_0_var(--lip)] transition-[translate,box-shadow,filter] duration-100 group-hover:brightness-105 group-active:translate-y-[6px] group-active:shadow-[0_0_0_var(--lip)]"
        style={
          {
            background: lit ? colours.fill : "var(--path-off)",
            "--lip": lit ? colours.lip : "var(--path-off-lip)",
            color: lit ? "#fff" : "var(--path-off-ink)",
          } as CSSProperties
        }
      >
        {/* a soft highlight, like a glossy button */}
        <span
          className="absolute top-2 left-1/2 h-3 w-8 -translate-x-1/2 rounded-full bg-white/25"
          aria-hidden="true"
        />
        {node.state === "done" ? (
          <CheckIcon size={34} strokeWidth={3.4} />
        ) : node.state === "locked" ? (
          <LockIcon size={28} strokeWidth={2.6} />
        ) : (
          <Icon size={30} strokeWidth={2.6} />
        )}
      </span>
    </>
  );
}

function BookStep({
  size = 24,
  strokeWidth = 2,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.5C10.3 5 7.9 4.5 4 4.5v13c3.9 0 6.3.5 8 2 1.7-1.5 4.1-2 8-2v-13c-3.9 0-6.3.5-8 2Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

/** "Start" speech bubble that bobs above the next step. */
function StartTag({ colours, label }: { colours: Palette; label: string }) {
  return (
    <span
      className="path-bob pointer-events-none absolute bottom-[calc(100%+20px)] left-1/2 z-10 -translate-x-1/2"
      aria-hidden="true"
    >
      <span
        className="path-tag relative block rounded-[12px] border-2 bg-surface px-3.5 py-1.5 text-[14px] font-extrabold tracking-wide whitespace-nowrap uppercase shadow-soft"
        style={
          {
            borderColor: "var(--color-line)",
            "--tag": colours.banner,
            "--tag-dark": colours.tagDark,
          } as CSSProperties
        }
      >
        {label}
        <span
          className="absolute top-full left-1/2 size-3 -translate-x-1/2 -translate-y-[5px] rotate-45 border-r-2 border-b-2 bg-surface"
          style={{ borderColor: "var(--color-line)" }}
        />
      </span>
    </span>
  );
}

/** The week's reward: a treasure chest, opened (with sparkles) once the week is done. */
function Chest({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 84 84"
      className={cn(
        "size-[84px] transition-transform group-hover:-translate-y-0.5",
        !open && "dim-chest",
      )}
      aria-hidden="true"
    >
      <ellipse cx="42" cy="74" rx="26" ry="5" fill="rgb(0 0 0 / 0.12)" />
      {open ? (
        <>
          <path
            d="M14 34 L42 22 L70 34 L70 38 L14 38Z"
            fill="#9b5a2a"
            transform="rotate(-18 14 36) translate(-2 -6)"
          />
          <rect x="16" y="38" width="52" height="32" rx="6" fill="#b86b32" />
          <rect x="16" y="38" width="52" height="8" fill="#ffd34d" />
          <circle cx="30" cy="36" r="5" fill="#ffd34d" />
          <circle cx="42" cy="33" r="6" fill="#ffe27a" />
          <circle cx="54" cy="36" r="5" fill="#ffd34d" />
          <rect x="38" y="46" width="8" height="10" rx="2" fill="#ffd34d" />
          <path
            d="M20 16l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z M64 12l1.6 3.4 3.4 1.6-3.4 1.6L64 22l-1.6-3.4L59 17l3.4-1.6Z"
            fill="#ffc83d"
          />
        </>
      ) : (
        <>
          <path d="M16 38c0-10 11-16 26-16s26 6 26 16v2H16Z" fill="#c07a3e" />
          <rect x="16" y="38" width="52" height="32" rx="6" fill="#b86b32" />
          <rect x="16" y="36" width="52" height="7" fill="#e0a34a" />
          <rect x="36" y="40" width="12" height="14" rx="3" fill="#ffd34d" />
          <circle cx="42" cy="47" r="2.2" fill="#9b5a2a" />
          <path
            d="M22 44v22M62 44v22"
            stroke="#9b5a2a"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

/** ELSA beside the path, cheering her on. */
function Cheer({ side, done }: { side: "left" | "right"; done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1",
        side === "left" ? "right-[calc(100%+18px)]" : "left-[calc(100%+18px)]",
      )}
    >
      <span className="w-[72px] rounded-[12px] border-2 border-line bg-surface px-1 py-1 text-center text-[11.5px] leading-[14px] font-extrabold text-ink shadow-soft">
        {done ? t.path.cheerDone : t.path.cheer}
      </span>
      <Face
        character={ELSA}
        className="size-12 overflow-hidden rounded-full border-[3px] border-surface shadow-soft"
      />
    </span>
  );
}
