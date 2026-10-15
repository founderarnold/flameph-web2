import { setStage } from "@/app/account/actions";

export const STAGE_CHOICES = [
  { value: "discover", label: "Discover", text: "May idea pa lang" },
  { value: "start", label: "Start", text: "Bagong negosyo" },
  { value: "build", label: "Build", text: "Inaayos ang sistema" },
  { value: "grow", label: "Grow", text: "Dumarami ang customers" },
  { value: "scale", label: "Scale", text: "Lalawak na" },
];

/** Five big buttons; tapping one saves the member's business stage. */
export function StagePicker({ back = "/account", narrow = false, only }: { back?: string; narrow?: boolean; only?: string[] }) {
  return (
    <form action={setStage} className={`mt-3 grid grid-cols-2 gap-2 ${narrow ? "sm:grid-cols-3" : "sm:grid-cols-5"}`}>
      <input type="hidden" name="back" value={back} />
      {STAGE_CHOICES.filter((c) => !only || only.includes(c.value)).map((c) => (
        <button key={c.value} name="stage" value={c.value} className="rounded-xl border border-line bg-bg p-3 text-left hover:border-primary hover:bg-primary-soft">
          <span className="block font-bold">{c.label}</span>
          <span className="block text-sm text-muted">{c.text}</span>
        </button>
      ))}
    </form>
  );
}
