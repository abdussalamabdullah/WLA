import { LAB_ICON, LAB_LABEL } from "@/features/missions/labs";
import type { WlaLab } from "@/types/database";

/**
 * The Lab glyph that precedes a mission's metadata on the public site.
 *
 * Decorative: the Lab name is already the first item of the meta row it sits
 * in, so announcing the icon too would read the same fact twice. Hidden from
 * assistive technology rather than given a redundant label.
 *
 * Renders nothing until the assets land — see LAB_ICON. That is deliberate:
 * the meta row reads correctly without it ("Decision Lab · Ages 11–15"), so
 * an absent icon costs a visual cue and no information.
 */
export function LabIcon({ lab, size = 20 }: { lab: WlaLab; size?: number }) {
  const src = LAB_ICON[lab];
  if (!src) return null;

  /*
   * A plain <img>, not next/image: a fixed-size local SVG gains nothing from
   * an optimisation pipeline, and next/image would want a static import that
   * cannot exist while the assets are still outstanding.
   */
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="inline-block shrink-0 opacity-80"
      style={{ width: size, height: size }}
      title={LAB_LABEL[lab]}
    />
  );
}
