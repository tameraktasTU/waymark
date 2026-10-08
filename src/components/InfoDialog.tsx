import { Route, ShieldCheck, X } from "lucide-react";
import type { RefObject } from "react";

export default function InfoDialog({
  dialogRef,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  return (
    <dialog
      ref={dialogRef}
      className="info-dialog fixed inset-0 m-auto max-h-[calc(100%-40px)] w-[min(550px,calc(100%-30px))] overflow-y-auto rounded-[15px] border border-[#dee7e0] p-0 text-ink backdrop:bg-[#173b354d] backdrop:backdrop-blur-[3px]"
      aria-labelledby="info-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="dialog-content relative p-8.5 small:px-5 small:py-6.25">
        <button
          className="dialog-close absolute top-4.25 right-4.25 border-0 bg-transparent p-1.25 text-[#789382]"
          aria-label="Close information"
          onClick={() => dialogRef.current?.close()}
        >
          <X size={20} />
        </button>
        <span className="dialog-icon grid size-11.5 place-items-center rounded-[11px] bg-[#edf4ef] text-[#43856b]">
          <Route size={24} />
        </span>
        <h2
          id="info-title"
          className="mt-5 mb-2.5 font-display text-[28px] leading-[1.2] font-medium tracking-[-.7px] small:text-[25px]"
        >
          Your journey, beautifully framed.
        </h2>
        <p className="dialog-intro text-control leading-[1.6] text-muted">
          A few simple steps from GPS points to a personal keepsake.
        </p>
        <ol className="how-steps my-6 pl-5 [&>li]:my-4.25 [&>li]:pl-1.5 [&>li]:text-[#518066] [&_strong]:text-control [&_strong]:font-semibold [&_strong]:text-[#415f4d] [&_p]:mt-1.25 [&_p]:text-control [&_p]:leading-[1.7] [&_p]:text-muted">
          <li>
            <strong>Bring your route</strong>
            <p>
              Export a GPX file from your fitness app or GPS device, then choose
              it here. Runs, rides, and hiking routes all work.
            </p>
          </li>
          <li>
            <strong>Make it your own</strong>
            <p>
              Choose a layout, change the colors, and add the details you want
              to remember. Every change appears in the preview.
            </p>
          </li>
          <li>
            <strong>Give it a place</strong>
            <p>
              Download a PNG or PDF. Print at the chosen paper size with scaling
              set to 100%. For larger prints, 300 DPI gives the most detail; 150
              DPI uses less memory. Or switch to Share for a PNG sized for an
              Instagram post, square image, Story, or wide image.
            </p>
          </li>
        </ol>
        <div className="dialog-privacy flex gap-3 rounded-lg bg-[#f2f7f3] p-3.75">
          <ShieldCheck size={20} className="text-[#518167]" />
          <div>
            <strong className="text-control font-medium">
              Your route stays on your device.
            </strong>
            <p className="mt-1.75 text-label leading-[1.7] text-muted">
              GPX files and poster settings are processed in this browser. There
              are no accounts, analytics, or server uploads. Map tiles come from
              OpenFreeMap, so that provider receives requests for the map area
              you view. Your work is cleared when you close or reload the page.
            </p>
          </div>
        </div>
        <p className="map-credits mt-4 text-caption leading-[1.7] text-muted [&_a]:underline [&_a]:underline-offset-2">
          Maps use{" "}
          <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>
          ,{" "}
          <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">
            OpenMapTiles
          </a>
          , and{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>
          .
        </p>
      </div>
    </dialog>
  );
}
